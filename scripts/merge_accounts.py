"""Admin utility: fold one person's two EcoEats accounts into one.

⚠️⚠️ THIS IS DESTRUCTIVE AND CANNOT BE UNDONE. The absorbed account's row and
its Firebase identity are both deleted. It runs a preview by default and
changes nothing without `--apply`.

Why it exists rather than a screen in the app: merging needs proof that one
person controls BOTH accounts, and a phone can only hold one Firebase session
at a time — so the in-app flow would have to sign the user into the second
account mid-way, leaving them briefly signed in to an account that is about to
be deleted. Duplicates are prevented at the source now (Settings → Ways to sign
in), so the population who need this is small enough to serve by hand rather
than with a fragile flow.

Usage, from the repo root:

    python scripts/merge_accounts.py --keep a@gmail.com --absorb b@gmail.com
    python scripts/merge_accounts.py --keep a@gmail.com --absorb b@gmail.com --apply

⚠️ DATABASE_URL decides WHICH DATABASE this touches, and .env points at the
local dev one. To act on production, pass the Neon URL explicitly:

    DATABASE_URL='postgresql://…-pooler…/neondb' python scripts/merge_accounts.py …

The account named by --keep survives. The one named by --absorb ceases to
exist.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from api.config import Settings  # noqa: E402
from api.db import create_engine  # noqa: E402
from api.models import User  # noqa: E402
from api.services.merge import merge_accounts  # noqa: E402

CREDENTIALS = Path("secrets/firebase-service-account.json")


async def _find(session, email: str) -> User:
    user = await session.scalar(
        select(User).where(User.email == email.lower().strip())
    )
    if user is None:
        sys.exit(f"No EcoEats profile for {email}.")
    return user


def _describe(user: User) -> str:
    return f"{user.email}  (uid {user.id}, role {user.role.value}, name {user.name!r})"


def _delete_identity(uid: str) -> None:
    """Remove the Firebase login too, or the duplicate returns on next launch."""
    if not CREDENTIALS.exists():
        print(f"⚠️  No service account at {CREDENTIALS} — Firebase identity")
        print(f"   {uid} was NOT deleted. It can still sign in and will make a")
        print("   fresh, empty profile. Delete it by hand in the console.")
        return
    import firebase_admin
    from firebase_admin import auth, credentials

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(CREDENTIALS)))
    try:
        auth.delete_user(uid)
        print(f"✔ Firebase identity {uid} deleted.")
    except auth.UserNotFoundError:
        print(f"✔ Firebase identity {uid} was already gone.")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", required=True, help="the account that survives")
    parser.add_argument("--absorb", required=True, help="the account that is deleted")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually do it; without this nothing is changed",
    )
    args = parser.parse_args()

    if args.keep.lower().strip() == args.absorb.lower().strip():
        sys.exit("Those are the same address.")

    settings = Settings()
    print(f"Database: {os.environ.get('DATABASE_URL', '(from .env)')[:60]}…\n")

    engine = create_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        keep = await _find(session, args.keep)
        absorb = await _find(session, args.absorb)

        print("KEEP    ", _describe(keep))
        print("ABSORB  ", _describe(absorb))
        print()

        if not args.apply:
            print("Preview only — nothing was changed. Re-run with --apply to do it.")
            await engine.dispose()
            return

        # Typing the address is the confirmation. A y/n prompt is too easy to
        # answer on autopilot for something with no undo.
        typed = input(f'Type "{absorb.email}" to confirm deletion: ').strip()
        if typed != absorb.email:
            sys.exit("Did not match. Nothing was changed.")

        summary = await merge_accounts(
            session, keep_id=keep.id, absorb_id=absorb.id
        )
        await session.delete(absorb)
        await session.commit()

        print()
        print(f"✔ Merged into {keep.email}:")
        for label in (
            "listings",
            "claims",
            "ratings",
            "saved",
            "notifications",
            "devices",
        ):
            print(f"    {getattr(summary, label):>4}  {label}")
        if summary.self_claims_removed:
            print(
                f"    {summary.self_claims_removed:>4}  claims on their own "
                "listing, removed"
            )
        for note in summary.skipped:
            print(f"    left behind: {note}")

    _delete_identity(absorb.id)
    await engine.dispose()
    print("\nDone. The absorbed account no longer exists.")


if __name__ == "__main__":
    asyncio.run(main())
