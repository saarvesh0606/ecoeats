"""The claim transaction and the claim state machine.

This is the heart of the product and the part v1 got most wrong. Everything
that moves a claim out of `pending` goes through :func:`resolve_claim`, so the
inventory arithmetic exists in exactly one place. v1 spread it across three
handlers, and the no-show path could run twice and refund twice.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.errors import ConflictError, NotFoundError
from api.models import Claim, Listing
from api.models.enums import RESERVATION_MINUTES, ClaimStatus, ListingStatus

#: Statuses that hand the portions back. Picking food up does not.
RELEASING = frozenset({ClaimStatus.NO_SHOW, ClaimStatus.CANCELLED})


async def create_claim(
    db: AsyncSession, *, listing_id: uuid.UUID, recipient_id: str, quantity: int = 1
) -> Claim:
    """Reserve portions from a listing.

    Every check happens while holding a row lock on the listing, so two
    recipients racing for the last portion are serialised by PostgreSQL rather
    than by hope.
    """
    now = datetime.now(UTC)

    # FOR UPDATE. Concurrent claims on this listing queue here until we commit,
    # which is what makes the read-modify-write below safe.
    listing = (
        await db.scalars(
            select(Listing).where(Listing.id == listing_id).with_for_update()
        )
    ).one_or_none()

    if listing is None:
        raise NotFoundError("That listing no longer exists")

    if listing.status is ListingStatus.CANCELLED:
        raise ConflictError("The organizer withdrew this listing")

    if listing.status is ListingStatus.EXPIRED or listing.expires_at <= now:
        # Checked against the clock, not just the status column. A sweep may
        # not have run yet -- v1 depended on one having run and let expired
        # listings be claimed.
        raise ConflictError("This food is no longer available — the post expired")

    if listing.status is not ListingStatus.ACTIVE:
        raise ConflictError("This food is no longer available")

    if listing.quantity_remaining < quantity:
        raise ConflictError(
            "Someone just took the last of it"
            if listing.quantity_remaining == 0
            else f"Only {listing.quantity_remaining} portion(s) left"
        )

    claim = Claim(
        listing_id=listing.id,
        recipient_id=recipient_id,
        quantity=quantity,
        status=ClaimStatus.PENDING,
        reservation_expires_at=now + timedelta(minutes=RESERVATION_MINUTES),
    )
    db.add(claim)

    listing.quantity_remaining -= quantity
    if listing.quantity_remaining == 0:
        listing.status = ListingStatus.CLAIMED

    try:
        await db.flush()
    except IntegrityError as exc:
        # uq_claim_per_recipient. We let the database arbitrate rather than
        # checking first: a SELECT-then-INSERT has a race between the two, and
        # two concurrent requests can both read "no existing claim".
        await db.rollback()
        if "uq_claim_per_recipient" in str(exc.orig):
            raise ConflictError("You have already claimed from this listing") from exc
        raise

    return claim


def resolve_claim(
    claim: Claim,
    listing: Listing,
    *,
    status: ClaimStatus,
    now: datetime | None = None,
) -> None:
    """Move a claim out of `pending`, returning its portions if appropriate.

    The single guard below is the fix for v1's worst bug. There, marking the
    same no-show twice refunded the portions twice, and a listing could end up
    advertising more food than ever existed. A claim that is not pending is
    already resolved and holds no inventory, so there is nothing to give back.
    """
    if status is ClaimStatus.PENDING:
        raise ValueError("resolve_claim moves a claim out of pending, not into it")

    if claim.status is not ClaimStatus.PENDING:
        raise ConflictError(
            f"This claim was already marked {claim.status.value.replace('_', ' ')}"
        )

    now = now or datetime.now(UTC)
    claim.status = status
    claim.resolved_at = now

    if status not in RELEASING:
        return

    listing.quantity_remaining += claim.quantity

    # Reopen only if the listing sold out; never resurrect one that expired or
    # was withdrawn. v1 set status to 'active' unconditionally, which brought
    # dead listings back into the feed.
    if listing.status is ListingStatus.CLAIMED and listing.expires_at > now:
        listing.status = ListingStatus.ACTIVE


async def load_claim_for_update(
    db: AsyncSession, claim_id: uuid.UUID
) -> tuple[Claim, Listing]:
    """Fetch a claim and its listing with the listing locked.

    The listing is locked because resolving a claim writes to its quantity, and
    that write must not race a concurrent claim.
    """
    claim = await db.get(Claim, claim_id)
    if claim is None:
        raise NotFoundError("That claim no longer exists")

    listing = (
        await db.scalars(
            select(Listing).where(Listing.id == claim.listing_id).with_for_update()
        )
    ).one()

    return claim, listing


async def sweep_expired_reservations(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    now: datetime | None = None,
) -> int:
    """Return portions from reservations nobody collected.

    v1 stored `reservation_expires_at` and never read it, so a recipient who
    did not turn up removed a portion from circulation permanently while the
    food sat there going to waste.

    Each claim is resolved in its own transaction: one bad row cannot stall the
    rest, and no lock is held across the whole batch.
    """
    now = now or datetime.now(UTC)

    async with session_factory() as session:
        due = (
            await session.scalars(
                select(Claim.id).where(
                    Claim.status == ClaimStatus.PENDING,
                    Claim.reservation_expires_at <= now,
                )
            )
        ).all()

    released = 0
    for claim_id in due:
        async with session_factory() as session:
            async with session.begin():
                claim, listing = await load_claim_for_update(session, claim_id)
                # Re-checked under the lock: it may have been collected or
                # cancelled between the scan above and now.
                if claim.status is not ClaimStatus.PENDING:
                    continue
                resolve_claim(claim, listing, status=ClaimStatus.NO_SHOW, now=now)
                released += 1

    return released


async def expire_stale_listings(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    now: datetime | None = None,
) -> int:
    """Flip listings whose window has closed to `expired`.

    Cosmetic rather than load-bearing: every query that matters already filters
    on `expires_at`. This just stops organizers seeing their finished posts
    described as active.
    """
    now = now or datetime.now(UTC)

    async with session_factory() as session:
        async with session.begin():
            stale = (
                await session.scalars(
                    select(Listing).where(
                        Listing.status.in_(
                            [ListingStatus.ACTIVE, ListingStatus.CLAIMED]
                        ),
                        Listing.expires_at <= now,
                    )
                )
            ).all()
            for listing in stale:
                listing.status = ListingStatus.EXPIRED

    return len(stale)


async def activate_scheduled_listings(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    now: datetime | None = None,
) -> int:
    """Flip scheduled posts to active once their go-live time arrives.

    The expiry window starts at go-live, not at creation, so a post scheduled
    for tomorrow still gets its full window when it appears.
    """
    now = now or datetime.now(UTC)

    async with session_factory() as session:
        async with session.begin():
            due = (
                await session.scalars(
                    select(Listing).where(
                        Listing.status == ListingStatus.SCHEDULED,
                        Listing.scheduled_for <= now,
                    )
                )
            ).all()
            for listing in due:
                listing.status = ListingStatus.ACTIVE
                listing.expires_at = now + timedelta(minutes=listing.expiry_minutes)
                listing.scheduled_for = None

    return len(due)
