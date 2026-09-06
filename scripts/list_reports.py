"""Admin utility: read the moderation queue, and close entries off it.

Reporting exists because Guideline 1.2 requires it, and `report_listing`
faithfully writes a row — but a row nobody reads is not moderation. This is the
other half: the thing that turns `reports` into a queue a human actually works,
and the reason the App Review notes can honestly promise a response within
24 hours.

Read-only by default. Nothing is changed without `--resolve`.

Usage, from the repo root:

    python scripts/list_reports.py                 # open reports, worst first
    python scripts/list_reports.py --all           # closed ones too
    python scripts/list_reports.py --resolve <id>  # mark one dealt with

⚠️ DATABASE_URL decides WHICH DATABASE this reads, and .env points at the local
dev one — which will be empty and look reassuring. To see the real queue, pass
the production URL explicitly:

    DATABASE_URL='postgresql://…-pooler…/neondb' python scripts/list_reports.py

Ordering is by severity first, not by time: `unsafe_food` is the only reason
here that can put somebody in hospital, so it sorts above everything else no
matter how old it is.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402
from sqlalchemy.orm import aliased  # noqa: E402

from api.config import Settings  # noqa: E402
from api.db import create_engine  # noqa: E402
from api.models import Report, ReportReason, User  # noqa: E402

#: Worst first. Anything not named here sorts last, so adding a reason to the
#: enum without touching this file degrades to "shown, just not prioritised"
#: rather than "silently dropped".
SEVERITY = [
    ReportReason.UNSAFE_FOOD,
    ReportReason.HARASSMENT,
    ReportReason.OFFENSIVE,
]


def _rank(reason: str) -> int:
    try:
        return SEVERITY.index(ReportReason(reason))
    except ValueError:
        return len(SEVERITY)


def _age(when: datetime) -> str:
    """How long this has been sitting there, in the units a human triages in."""
    delta = datetime.now(UTC) - when
    hours = delta.total_seconds() / 3600
    if hours < 1:
        return f"{int(delta.total_seconds() // 60)}m ago"
    if hours < 48:
        return f"{int(hours)}h ago"
    return f"{int(hours // 24)}d ago"


def _who(email: str | None) -> str:
    # Every foreign key on `reports` is SET NULL, so a deleted account leaves a
    # report standing with nobody attached. That is deliberate — say so rather
    # than printing an empty column.
    return email or "(account deleted)"


async def _show(session, *, include_closed: bool) -> None:
    reporter = aliased(User)
    reported = aliased(User)

    stmt = (
        select(Report, reporter.email, reported.email)
        .outerjoin(reporter, Report.reporter_id == reporter.id)
        .outerjoin(reported, Report.reported_user_id == reported.id)
        .order_by(Report.created_at.desc())
    )
    if not include_closed:
        stmt = stmt.where(Report.resolved_at.is_(None))

    rows = (await session.execute(stmt)).all()
    rows.sort(key=lambda row: (row[0].resolved_at is not None, _rank(row[0].reason)))

    if not rows:
        print("Nothing to moderate. The queue is empty.")
        return

    open_count = sum(1 for row in rows if row[0].resolved_at is None)
    line = f"{open_count} open"
    if include_closed:
        line += f", {len(rows) - open_count} closed"
    print(line)
    print()

    for report, reporter_email, reported_email in rows:
        state = "OPEN  " if report.resolved_at is None else "closed"
        head = f"{state}  {report.reason.upper():<12} {_age(report.created_at):>8}"
        print(f"{head}  {report.id}")
        print(f"        listing   {report.listing_title or '(no title recorded)'}")
        print(f"        about     {_who(reported_email)}")
        print(f"        from      {_who(reporter_email)}")
        if report.detail:
            print(f"        said      {report.detail}")
        print()

    if open_count:
        print("Close one with:  python scripts/list_reports.py --resolve <id>")


async def _resolve(session, raw_id: str) -> None:
    try:
        report_id = uuid.UUID(raw_id)
    except ValueError:
        sys.exit(f"{raw_id!r} is not a report id. Copy one from the listing above.")

    report = await session.get(Report, report_id)
    if report is None:
        sys.exit(f"No report {report_id}.")
    if report.resolved_at is not None:
        closed = f"{report.resolved_at:%Y-%m-%d %H:%M UTC}"
        print(f"Already closed at {closed}. Nothing to do.")
        return

    report.resolved_at = func.now()
    await session.commit()
    print(f"✔ Closed {report_id} ({report.reason}).")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all", action="store_true", help="show resolved reports as well"
    )
    parser.add_argument(
        "--resolve", metavar="ID", help="mark one report dealt with, by id"
    )
    args = parser.parse_args()

    settings = Settings()
    print(f"Database: {os.environ.get('DATABASE_URL', '(from .env)')[:60]}…\n")

    engine = create_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        if args.resolve:
            await _resolve(session, args.resolve)
        else:
            await _show(session, include_closed=args.all)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
