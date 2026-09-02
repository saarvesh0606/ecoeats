"""Folding one account's history into another.

Two EcoEats accounts can belong to one person: Sign in with Apple's "Hide My
Email" issues a relay address that is deliberately unmatchable to their real
one, so signing in with Apple and later with Google produces two identities we
cannot tell apart. Linking (see the client's SignInMethods) stops new ones
forming; this is the cleanup for the pair that already exist.

Everything happens in the caller's transaction, so a merge is all-or-nothing:
there is no state where half the food has moved.

Two collisions are possible and neither is an error — they are the same person
having done the same thing twice:

  * both accounts saved the same listing
  * both accounts claimed the same listing

Rows that would collide are left behind rather than moved, and go when the
absorbed account is deleted. Where one of a pair must survive, the kept
account's own row is the one that stays.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class MergeSummary:
    """What actually moved. Reported back so a merge is never silent."""

    listings: int = 0
    claims: int = 0
    ratings: int = 0
    saved: int = 0
    notifications: int = 0
    devices: int = 0
    #: Claims dropped because they were on the kept account's own listing —
    #: after a merge that is a claim on your own food, which means nothing.
    self_claims_removed: int = 0
    skipped: list[str] = field(default_factory=list)


#: Plain moves: nothing about these can collide, so they transfer wholesale.
_SIMPLE_MOVES: tuple[tuple[str, str, str], ...] = (
    ("listings", "organizer_id", "listings"),
    ("notifications", "user_id", "notifications"),
    ("device_tokens", "user_id", "devices"),
    ("ratings", "host_id", "ratings"),
    ("ratings", "recipient_id", "ratings"),
)


async def merge_accounts(
    db: AsyncSession, *, keep_id: str, absorb_id: str
) -> MergeSummary:
    """Move everything belonging to ``absorb_id`` onto ``keep_id``.

    The caller is responsible for having proved that one person controls both,
    and for deleting the absorbed row afterwards — this only moves rows. The
    delete is left outside so the caller can also remove the identity, and so
    the whole thing sits in one transaction it owns.
    """
    counts: dict[str, int] = {}
    skipped: list[str] = []

    # --- the two that can collide -----------------------------------------
    # Guarded by NOT EXISTS rather than ON CONFLICT: the row that loses must be
    # the absorbed one, and it must be left in place so the cascade takes it.
    saved = await db.execute(
        text(
            """
            UPDATE saved_listings AS s
               SET user_id = :keep
             WHERE s.user_id = :absorb
               AND NOT EXISTS (
                   SELECT 1 FROM saved_listings AS k
                    WHERE k.user_id = :keep
                      AND k.listing_id = s.listing_id
               )
            """
        ),
        {"keep": keep_id, "absorb": absorb_id},
    )
    counts["saved"] = saved.rowcount or 0

    claims = await db.execute(
        text(
            """
            UPDATE claims AS c
               SET recipient_id = :keep
             WHERE c.recipient_id = :absorb
               AND NOT EXISTS (
                   SELECT 1 FROM claims AS k
                    WHERE k.recipient_id = :keep
                      AND k.listing_id = c.listing_id
               )
            """
        ),
        {"keep": keep_id, "absorb": absorb_id},
    )
    counts["claims"] = claims.rowcount or 0

    remaining_saved = await db.scalar(
        text("SELECT count(*) FROM saved_listings WHERE user_id = :absorb"),
        {"absorb": absorb_id},
    )
    if remaining_saved:
        skipped.append(f"{remaining_saved} already-saved listing(s)")

    remaining_claims = await db.scalar(
        text("SELECT count(*) FROM claims WHERE recipient_id = :absorb"),
        {"absorb": absorb_id},
    )
    if remaining_claims:
        skipped.append(f"{remaining_claims} duplicate claim(s)")

    # --- everything else moves wholesale ----------------------------------
    for table, column, key in _SIMPLE_MOVES:
        result = await db.execute(
            text(
                f"UPDATE {table} SET {column} = :keep WHERE {column} = :absorb"  # noqa: S608
            ),
            {"keep": keep_id, "absorb": absorb_id},
        )
        counts[key] = counts.get(key, 0) + (result.rowcount or 0)

    # --- a claim on your own food means nothing ---------------------------
    # Only reachable through a merge: one account hosted the listing, the other
    # claimed it, and they have just become the same person. Leaving it would
    # tell them somebody is coming to collect, and that somebody is them.
    self_claims = await db.execute(
        text(
            """
            DELETE FROM claims AS c
             USING listings AS l
             WHERE c.listing_id = l.id
               AND c.recipient_id = :keep
               AND l.organizer_id = :keep
            """
        ),
        {"keep": keep_id},
    )
    removed = self_claims.rowcount or 0

    summary = MergeSummary(
        listings=counts.get("listings", 0),
        claims=counts.get("claims", 0),
        ratings=counts.get("ratings", 0),
        saved=counts.get("saved", 0),
        notifications=counts.get("notifications", 0),
        devices=counts.get("devices", 0),
        self_claims_removed=removed,
        skipped=skipped,
    )
    logger.info("Merged %s into %s: %s", absorb_id, keep_id, summary)
    return summary
