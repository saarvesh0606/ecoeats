"""Claim routes: reserving food, and the organizer's pickup panel."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import CurrentUser, DbSession, rate_limited
from api.errors import ForbiddenError, NotFoundError, ValidationError
from api.events import listing_event
from api.models import Claim, Listing, Notification, Rating
from api.models.enums import ClaimStatus, UserRole
from api.schemas.claim import ClaimedListing, ClaimList, ClaimOut, CreateClaim
from api.schemas.rating import CreateRating
from api.services import claims as service

router = APIRouter(tags=["claims"])

MAX_CLAIMS_RETURNED = 50


def _publish_listing(
    request: Request, background_tasks: BackgroundTasks, listing: Listing
) -> None:
    """Broadcast the listing's new state after the response (post-commit)."""
    event = listing_event(listing)
    background_tasks.add_task(request.app.state.event_bus.publish, event)


def _serialise(
    claim: Claim, *, listing: Listing | None = None, is_rated: bool = False
) -> ClaimOut:
    return ClaimOut(
        id=str(claim.id),
        listing_id=str(claim.listing_id),
        recipient_id=claim.recipient_id,
        recipient_name=claim.recipient.name,
        quantity=claim.quantity,
        status=claim.status,
        claimed_at=claim.claimed_at,
        reservation_expires_at=claim.reservation_expires_at,
        resolved_at=claim.resolved_at,
        is_rated=is_rated,
        listing=(
            ClaimedListing(
                id=str(listing.id),
                title=listing.title,
                allergens=listing.allergens,
                campus=listing.campus,
                building=listing.building,
                room=listing.room,
                placement_note=listing.placement_note,
                lat=listing.lat,
                lng=listing.lng,
                expires_at=listing.expires_at,
                photo_urls=[photo.url for photo in listing.photos],
            )
            if listing is not None
            else None
        ),
    )


@router.post(
    "/claims",
    response_model=ClaimOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("claim", limit=20, window_seconds=60))],
)
async def claim_food(
    body: CreateClaim,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ClaimOut:
    """Reserve one portion.

    Organizers are excluded — they post food, they do not compete for it.
    """
    if user.role is not UserRole.RECIPIENT:
        raise ForbiddenError(
            "Organizer accounts post food rather than claim it."
        )

    try:
        listing_id = uuid.UUID(body.listing_id)
    except ValueError as exc:
        raise ValidationError("That is not a valid listing id") from exc

    claim = await service.create_claim(
        db, listing_id=listing_id, recipient_id=user.id
    )
    await db.flush()

    full = await _load_claim_with_relations(db, claim.id)
    if full.listing is not None:
        db.add(
            Notification(
                user_id=full.listing.organizer_id,
                message=f"{user.name} claimed {full.listing.title}",
                listing_id=full.listing.id,
            )
        )
        _publish_listing(request, background_tasks, full.listing)
    return _serialise(full, listing=full.listing)


async def _load_claim_with_relations(db: DbSession, claim_id: uuid.UUID) -> Claim:
    result = await db.scalars(
        select(Claim)
        .where(Claim.id == claim_id)
        .options(
            selectinload(Claim.recipient),
            selectinload(Claim.listing).selectinload(Listing.photos),
        )
    )
    claim = result.one_or_none()
    if claim is None:
        raise NotFoundError("That claim no longer exists")
    return claim


@router.get("/claims/mine", response_model=ClaimList)
async def my_claims(db: DbSession, user: CurrentUser) -> ClaimList:
    """A recipient's claims, newest first, with the address to collect from."""
    rows = (
        await db.scalars(
            select(Claim)
            .where(Claim.recipient_id == user.id)
            .options(
                selectinload(Claim.recipient),
                selectinload(Claim.listing).selectinload(Listing.photos),
            )
            .order_by(Claim.claimed_at.desc())
            .limit(MAX_CLAIMS_RETURNED)
        )
    ).all()

    # Which of these claims already carry a rating — so the client knows whether
    # to offer "rate the host".
    rated = set(
        (
            await db.scalars(
                select(Rating.claim_id).where(
                    Rating.claim_id.in_([claim.id for claim in rows])
                )
            )
        ).all()
    ) if rows else set()

    items = [
        _serialise(claim, listing=claim.listing, is_rated=claim.id in rated)
        for claim in rows
    ]
    return ClaimList(items=items, count=len(items))


@router.get("/listings/{listing_id}/claims", response_model=ClaimList)
async def claims_for_listing(
    listing_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> ClaimList:
    """Who is coming to collect. Organizer's view of their own listing."""
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("That listing no longer exists")
    if listing.organizer_id != user.id:
        raise ForbiddenError("Only the organizer who posted this can see its claims")

    rows = (
        await db.scalars(
            select(Claim)
            .where(Claim.listing_id == listing_id)
            .options(selectinload(Claim.recipient))
            .order_by(Claim.claimed_at.asc())
            .limit(MAX_CLAIMS_RETURNED)
        )
    ).all()

    return ClaimList(
        items=[_serialise(claim) for claim in rows], count=len(rows)
    )


@router.post(
    "/claims/{claim_id}/rate",
    response_model=ClaimOut,
    status_code=status.HTTP_201_CREATED,
)
async def rate_host(
    claim_id: uuid.UUID,
    body: CreateRating,
    db: DbSession,
    user: CurrentUser,
) -> ClaimOut:
    """Rate the host after collecting food.

    Only the recipient of a confirmed pickup can rate it, and only once — the
    rating is tied to the claim, so it can't be invented without a real handoff.
    """
    claim = await _load_claim_with_relations(db, claim_id)

    if claim.recipient_id != user.id:
        raise ForbiddenError("You can only rate your own pickups")
    if claim.status is not ClaimStatus.PICKED_UP:
        raise ValidationError("You can rate a host once the pickup is confirmed")
    if claim.listing is None:
        raise NotFoundError("That listing no longer exists")

    already = await db.scalar(select(Rating.id).where(Rating.claim_id == claim_id))
    if already is not None:
        raise ValidationError("You've already rated this pickup")

    db.add(
        Rating(
            claim_id=claim_id,
            host_id=claim.listing.organizer_id,
            recipient_id=user.id,
            stars=body.stars,
            comment=body.comment,
        )
    )
    db.add(
        Notification(
            user_id=claim.listing.organizer_id,
            message=f"{user.name} rated you {body.stars}★",
            listing_id=claim.listing_id,
        )
    )
    await db.flush()

    return _serialise(claim, listing=claim.listing, is_rated=True)


async def _resolve(
    claim_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
    *,
    target: ClaimStatus,
    actor: str,
) -> ClaimOut:
    """Shared body for pickup, no-show and cancel.

    Authorisation differs by action; the inventory arithmetic does not, and
    lives in services.claims.resolve_claim.
    """
    claim, listing = await service.load_claim_for_update(db, claim_id)

    if actor == "organizer" and listing.organizer_id != user.id:
        raise ForbiddenError("Only the organizer who posted this can do that")
    if actor == "recipient" and claim.recipient_id != user.id:
        raise ForbiddenError("You can only change your own claim")

    service.resolve_claim(claim, listing, status=target)
    await db.flush()

    if target is ClaimStatus.PICKED_UP:
        db.add(
            Notification(
                user_id=claim.recipient_id,
                message=f"Pickup confirmed for {listing.title}",
                listing_id=listing.id,
            )
        )

    # no-show and cancel return a portion to the pool; pickup doesn't change the
    # listing, but re-broadcasting the same values is harmless and keeps this
    # simple.
    _publish_listing(request, background_tasks, listing)

    full = await _load_claim_with_relations(db, claim_id)
    return _serialise(full, listing=full.listing)


@router.post("/claims/{claim_id}/pickup", response_model=ClaimOut)
async def confirm_pickup(
    claim_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ClaimOut:
    """Organizer confirms the food was collected. Portions are not returned."""
    return await _resolve(
        claim_id,
        db,
        user,
        request,
        background_tasks,
        target=ClaimStatus.PICKED_UP,
        actor="organizer",
    )


@router.post("/claims/{claim_id}/no-show", response_model=ClaimOut)
async def mark_no_show(
    claim_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ClaimOut:
    """Organizer releases a reservation nobody collected."""
    return await _resolve(
        claim_id,
        db,
        user,
        request,
        background_tasks,
        target=ClaimStatus.NO_SHOW,
        actor="organizer",
    )


@router.post("/claims/{claim_id}/cancel", response_model=ClaimOut)
async def cancel_claim(
    claim_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ClaimOut:
    """Recipient releases their own claim.

    Absent from the feature spec, and the gap that made it necessary: a
    reservation with no way out means one person who changes their mind shrinks
    a listing permanently while the food sits there.
    """
    return await _resolve(
        claim_id,
        db,
        user,
        request,
        background_tasks,
        target=ClaimStatus.CANCELLED,
        actor="recipient",
    )
