"""Listing routes: the organizer's posting panel and the recipient's feed."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import (
    CurrentOrganizer,
    CurrentUser,
    DbSession,
    identity_from_request,
    rate_limited,
)
from api.errors import ForbiddenError, NotFoundError, ValidationError
from api.events import listing_event
from api.geo import bounding_box, haversine_miles
from api.models import Listing, ListingPhoto
from api.models.enums import ListingStatus
from api.schemas.listing import (
    CreateListing,
    ListingFeed,
    ListingOut,
    Organizer,
    UpdateListing,
)
from api.services import listings as rules

router = APIRouter(prefix="/listings", tags=["listings"])

#: Upper bound on a single feed page. A campus does not produce more surplus
#: than this inside one expiry window.
MAX_FEED_RESULTS = 50


def _with_relations(stmt: Select) -> Select:
    """Eager-load what the response needs.

    Lazy loading raises under asyncio, and loading per row would be N+1 anyway.
    """
    return stmt.options(
        selectinload(Listing.photos),
        selectinload(Listing.organizer),
    )


def _serialise(listing: Listing, *, distance_miles: float | None = None) -> ListingOut:
    return ListingOut(
        id=str(listing.id),
        title=listing.title,
        description=listing.description,
        allergens=listing.allergens,
        dietary_tags=list(listing.dietary_tags),
        quantity_total=listing.quantity_total,
        quantity_remaining=listing.quantity_remaining,
        campus=listing.campus,
        building=listing.building,
        room=listing.room,
        placement_note=listing.placement_note,
        lat=listing.lat,
        lng=listing.lng,
        expires_at=listing.expires_at,
        status=listing.status,
        created_at=listing.created_at,
        organizer=Organizer(id=listing.organizer.id, name=listing.organizer.name),
        photo_urls=[photo.url for photo in listing.photos],
        distance_miles=distance_miles,
    )


async def _load(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    result = await db.scalars(
        _with_relations(select(Listing).where(Listing.id == listing_id))
    )
    listing = result.one_or_none()
    if listing is None:
        raise NotFoundError("That listing no longer exists")
    return listing


def _assert_owner(listing: Listing, user_id: str) -> None:
    if listing.organizer_id != user_id:
        raise ForbiddenError("Only the organizer who posted this can change it")


def _publish_change(
    request: Request, background_tasks: BackgroundTasks, listing: Listing
) -> None:
    """Broadcast a listing change to connected clients — after the response, so
    it runs post-commit and never delays the request."""
    event = listing_event(listing)
    background_tasks.add_task(request.app.state.event_bus.publish, event)


# ---------------------------------------------------------------------------
# Recipient feed
# ---------------------------------------------------------------------------


@router.get("", response_model=ListingFeed)
async def browse(
    db: DbSession,
    user: CurrentUser,
    dietary: Annotated[
        list[str] | None,
        Query(description="Only listings carrying every tag given."),
    ] = None,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius_miles: Annotated[float | None, Query(gt=0, le=50)] = None,
    max_minutes: Annotated[
        int | None,
        Query(gt=0, le=60, description="Only listings expiring within N minutes."),
    ] = None,
) -> ListingFeed:
    """Active food, most urgent first.

    Ordered by expiry rather than recency: the whole point is rescuing food
    before it is wasted, so what is about to disappear belongs at the top.

    Expiry is filtered in the query rather than trusted from `status`. v1 ran a
    sweep first and read the status column, so anything posted between sweeps
    showed up as available after it had expired.
    """
    now = datetime.now(UTC)

    stmt = _with_relations(
        select(Listing).where(
            Listing.status == ListingStatus.ACTIVE,
            Listing.expires_at > now,
            Listing.quantity_remaining > 0,
        )
    )

    if dietary:
        # ARRAY containment: the listing must carry every requested tag.
        stmt = stmt.where(Listing.dietary_tags.contains(dietary))

    if max_minutes is not None:
        stmt = stmt.where(Listing.expires_at <= now + timedelta(minutes=max_minutes))

    located = lat is not None and lng is not None
    if radius_miles is not None and not located:
        raise ValidationError("radius_miles needs lat and lng as well")

    if located and radius_miles is not None:
        # Cheap, index-friendly pre-filter. Corners get trimmed below by the
        # exact distance check.
        min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radius_miles)
        stmt = stmt.where(
            Listing.lat.between(min_lat, max_lat),
            Listing.lng.between(min_lng, max_lng),
        )

    stmt = stmt.order_by(Listing.expires_at.asc()).limit(MAX_FEED_RESULTS)

    rows = (await db.scalars(stmt)).all()

    items: list[ListingOut] = []
    for listing in rows:
        distance = None
        if located:
            distance = haversine_miles(lat, lng, listing.lat, listing.lng)
            if radius_miles is not None and distance > radius_miles:
                continue  # inside the box, outside the circle
        items.append(_serialise(listing, distance_miles=distance))

    return ListingFeed(items=items, count=len(items))


@router.get("/mine", response_model=ListingFeed)
async def my_listings(db: DbSession, organizer: CurrentOrganizer) -> ListingFeed:
    """An organizer's own posts, including expired and cancelled ones.

    Declared before /{listing_id} so "mine" is not parsed as an id.
    """
    stmt = _with_relations(
        select(Listing)
        .where(Listing.organizer_id == organizer.id)
        .order_by(Listing.created_at.desc())
        .limit(MAX_FEED_RESULTS)
    )
    rows = (await db.scalars(stmt)).all()
    return ListingFeed(
        items=[_serialise(listing) for listing in rows], count=len(rows)
    )


@router.get("/stream")
async def stream(request: Request) -> StreamingResponse:
    """Server-Sent Events: live listing changes, so the feed never polls.

    Auth is resolved from a header or a `token` query parameter (EventSource
    can't send headers). Each connected client gets a subscription to the event
    bus; a heartbeat keeps idle connections open through proxies.
    """
    identity_from_request(request)  # authorise; the id itself isn't needed here
    bus = request.app.state.event_bus

    async def events() -> "asyncio.AsyncIterator[str]":
        async with bus.subscribe() as queue:
            # An initial comment opens the stream and defeats proxy buffering.
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20)
                except (TimeoutError, asyncio.TimeoutError):
                    yield ": keepalive\n\n"  # heartbeat keeps idle links open
                    continue
                yield f"data: {event.to_json()}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer the stream
        },
    )


@router.get("/{listing_id}", response_model=ListingOut)
async def read(listing_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ListingOut:
    return _serialise(await _load(db, listing_id))


# ---------------------------------------------------------------------------
# Organizer panel
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ListingOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("listing", limit=20, window_seconds=60))],
)
async def create(
    body: CreateListing,
    db: DbSession,
    organizer: CurrentOrganizer,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ListingOut:
    """Post surplus food.

    The expiry clock starts now — the organizer picks a window, and the server
    computes the deadline. A client-supplied `expires_at` would be trivially
    forgeable.
    """
    now = datetime.now(UTC)
    listing = Listing(
        organizer_id=organizer.id,
        title=body.title,
        description=body.description,
        description_source=body.description_source,
        allergens=body.allergens,
        dietary_tags=body.dietary_tags,
        quantity_total=body.quantity_total,
        quantity_remaining=body.quantity_total,
        campus=body.location.campus,
        building=body.location.building,
        room=body.location.room,
        placement_note=body.location.placement_note,
        lat=body.location.lat,
        lng=body.location.lng,
        expiry_minutes=body.expiry_minutes,
        expires_at=now + timedelta(minutes=body.expiry_minutes),
        status=ListingStatus.ACTIVE,
    )
    db.add(listing)
    await db.flush()

    for position, url in enumerate(body.photo_urls):
        db.add(ListingPhoto(listing_id=listing.id, url=url, position=position))

    await db.flush()
    _publish_change(request, background_tasks, listing)
    return _serialise(await _load(db, listing.id))


@router.patch("/{listing_id}", response_model=ListingOut)
async def update(
    listing_id: uuid.UUID,
    body: UpdateListing,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ListingOut:
    """Edit a live post.

    Everything descriptive is editable, as the spec requires. Two things are
    not: who posted it, and when it expires.
    """
    listing = await _load(db, listing_id)
    _assert_owner(listing, user.id)
    rules.assert_editable(listing)

    fields = body.model_dump(exclude_unset=True, exclude={"location", "status", "quantity_total"})
    for field, value in fields.items():
        setattr(listing, field, value)

    if body.location is not None:
        listing.campus = body.location.campus
        listing.building = body.location.building
        listing.room = body.location.room
        listing.placement_note = body.location.placement_note
        listing.lat = body.location.lat
        listing.lng = body.location.lng

    if body.quantity_total is not None:
        rules.apply_new_total(listing, body.quantity_total)

    if body.status is not None:
        target = ListingStatus(body.status)
        rules.assert_can_transition(listing.status, target)
        listing.status = target

    await db.flush()
    _publish_change(request, background_tasks, listing)
    return _serialise(listing)


@router.post("/{listing_id}/cancel", response_model=ListingOut)
async def cancel(
    listing_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ListingOut:
    """Withdraw a post. Idempotent — cancelling twice is not an error."""
    listing = await _load(db, listing_id)
    _assert_owner(listing, user.id)

    if listing.status is ListingStatus.CANCELLED:
        return _serialise(listing)

    rules.assert_can_transition(listing.status, ListingStatus.CANCELLED)
    listing.status = ListingStatus.CANCELLED
    await db.flush()
    _publish_change(request, background_tasks, listing)
    return _serialise(listing)
