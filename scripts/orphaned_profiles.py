"""Admin utility: find (and remove) profiles whose sign-in identity is gone.

An orphan is a `users` row whose Firebase uid no longer exists. Nobody can ever
sign in as it again — but the address is unique, so it still holds that address
hostage: the person cannot register with it either. Before the 409 fix they got
"Internal server error" and no way to understand it; after the fix they get a
clear refusal, which is better but still a refusal. Deleting the row is what
actually hands the address back.

Rows go orphaned when a Firebase identity is deleted without its profile —
`scripts/dev_account.py delete`, or a deletion in the Firebase console. The
app's own `DELETE /users/me` removes both, so it never causes this.

Usage, from the repo root:

    python scripts/orphaned_profiles.py                      # list every orphan
    python scripts/orphaned_profiles.py --email a@b.com      # check one address
    python scripts/orphaned_profiles.py --email a@b.com --apply

⚠️ DATABASE_URL decides WHICH DATABASE this touches, and .env points at the
local dev one. To act on production, pass the Neon URL explicitly:

    DATABASE_URL='postgresql://…-pooler…/neondb' python scripts/orphaned_profiles.py

⚠️ Deleting is permanent and cascades: every foreign key pointing at `users` is
ON DELETE CASCADE, so the row's listings, claims, ratings, saved items,
notifications and devices go with it. A row with anything attached is reported
but never deleted without `--force` — an orphan with real history is a merge
candidate (`scripts/merge_accounts.py`), not a cleanup one.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from api.config import Settings  # noqa: E402
from api.db import create_engine  # noqa: E402
from api.models import Claim, Listing, User  # noqa: E402

CREDENTIALS = Path("secrets/firebase-service-account.json")


def _identity_exists(uid: str) -> bool:
    """Whether Firebase still knows this uid.

    Raises rather than guessing: treating an unreachable Firebase as "identity
    gone" would delete live accounts.
    """
    import firebase_admin
    from firebase_admin import auth, credentials

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(CREDENTIALS)))
    try:
        auth.get_user(uid)
    except auth.UserNotFoundError:
        return False
    return True


async def _attachments(session: AsyncSession, user_id: str) -> dict[str, int]:
    """What would be destroyed along with this row, by the cascades."""
    listings = await session.scalar(
        select(func.count(Listing.id)).where(Listing.organizer_id == user_id)
    )
    claims = await session.scalar(
        select(func.count(Claim.id)).where(Claim.recipient_id == user_id)
    )
    return {"listings": listings or 0, "claims": claims or 0}


async def main() -> None:
    # A Windows console is cp1252, which cannot encode the marks below — and
    # the deletion is committed before they print, so a crash here would report
    # failure for work that succeeded.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--email",
        action="append",
        default=[],
        help="only check these addresses (repeatable); default is every row",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually delete the orphans; without this nothing is changed",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="also delete orphans that still have listings or claims attached",
    )
    args = parser.parse_args()

    if not CREDENTIALS.exists():
        sys.exit(
            f"No service account at {CREDENTIALS}. Without it there is no way to\n"
            "tell an orphan from a live account, and guessing deletes real ones."
        )

    settings = Settings()
    print(f"Database: {os.environ.get('DATABASE_URL', '(from .env)')[:60]}…\n")

    engine = create_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        query = select(User).order_by(User.email)
        if args.email:
            wanted = [e.lower().strip() for e in args.email]
            query = query.where(User.email.in_(wanted))
        rows = list(await session.scalars(query))

        if args.email:
            found = {u.email for u in rows}
            for address in (e.lower().strip() for e in args.email):
                if address not in found:
                    print(f"  {address}: no profile row — the address is free.")

        orphans: list[tuple[User, dict[str, int]]] = []
        for user in rows:
            if _identity_exists(user.id):
                continue
            orphans.append((user, await _attachments(session, user.id)))

        if not orphans:
            print(f"No orphans among {len(rows)} row(s) checked.")
            await engine.dispose()
            return

        print(f"{len(orphans)} orphaned profile(s) — uid gone, address held:\n")
        blocked = []
        for user, attached in orphans:
            extra = ", ".join(f"{n} {k}" for k, n in attached.items() if n)
            print(f"  {user.email}")
            print(f"      uid {user.id}, role {user.role.value}, name {user.name!r}")
            if extra:
                print(f"      ⚠️  would also destroy: {extra}")
                if not args.force:
                    blocked.append(user.email)
        print()

        if blocked:
            print("Skipping (has history — merge it instead, or pass --force):")
            for address in blocked:
                print(f"    {address}")
            print()

        deletable = [
            user
            for user, attached in orphans
            if args.force or not any(attached.values())
        ]
        if not args.apply:
            print(
                f"Preview only — nothing was changed. Re-run with --apply to "
                f"delete {len(deletable)} row(s)."
            )
            await engine.dispose()
            return
        if not deletable:
            print("Nothing to delete.")
            await engine.dispose()
            return

        # Typing the count is the confirmation. A y/n prompt is too easy to
        # answer on autopilot for something with no undo.
        typed = input(f"Type {len(deletable)} to delete that many rows: ").strip()
        if typed != str(len(deletable)):
            sys.exit("Did not match. Nothing was changed.")

        for user in deletable:
            await session.delete(user)
        await session.commit()

        print()
        for user in deletable:
            print(f"✔ {user.email} released — it can register again.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
