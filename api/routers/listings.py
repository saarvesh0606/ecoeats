"""Listing routes: the organizer's posting panel and the recipient's feed."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, delete, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
from api.models import Claim, Listing, ListingPhoto, Rating, SavedListing
from api.models.enums import ClaimStatus, ListingStatus
from api.pagination import decode_cursor, encode_cursor
from api.schemas.listing import (
    CreateListing,
    HostImpact,
    ListingFeed,
    ListingOut,
    Organizer,
    UpdateListing,
)
from api.services import listings as rules

router = APIRouter(prefix="/listings", tags=["listings"])

#: Largest page a client may ask for. A guard against a single request pulling
#: the whole table; real paging uses the cursor, not an ever-growing limit.
MAX_FEED_RESULTS = 50

#: Page size when the client doesn't specify one.
DEFAULT_FEED_LIMIT = 20


def _with_relations(stmt: Select) -> Select:
    """Eager-load what the response needs.

    Lazy loading raises under asyncio, and loading per row would be N+1 anyway.
    """
    return stmt.options(
        selectinload(Listing.photos),
        selectinload(Listing.organizer),
    )


def _serialise(
    listing: Listing,
    *,
    distance_miles: float | None = None,
    is_saved: bool = False,
    organizer_rating: float | None = None,
    organizer_rating_count: int = 0,
    interested_count: int = 0,
) -> ListingOut:
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
        scheduled_for=listing.scheduled_for,
        organizer=Organizer(
            id=listing.organizer.id,
            name=listing.organizer.name,
            rating=organizer_rating,
            rating_count=organizer_rating_count,
        ),
        photo_urls=[photo.url for photo in listing.photos],
        distance_miles=distance_miles,
        is_saved=is_saved,
        interested_count=interested_count,
    )


async def _host_rating(db: AsyncSession, host_id: str) -> tuple[float | None, int]:
    """A host's average star rating and how many ratings it's based on."""
    avg, count = (
        await db.execute(
            select(func.avg(Rating.stars), func.count(Rating.id)).where(
                Rating.host_id == host_id
            )
        )
    ).one()
    return (round(float(avg), 1) if count else None), count


async def _saved_ids(
    db: AsyncSession, user_id: str, listing_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    """Which of these listings the given user has bookmarked."""
    if not listing_ids:
        return set()
    result = await db.scalars(
        select(SavedListing.listing_id).where(
            SavedListing.user_id == user_id,
            SavedListing.listing_id.in_(listing_ids),
        )
    )
    return set(result.all())


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
    q: Annotated[
        str | None,
        Query(
            max_length=100,
            description="Free-text search over title, description and location.",
        ),
    ] = None,
    limit: Annotated[
        int, Query(ge=1, le=MAX_FEED_RESULTS, description="Page size.")
    ] = DEFAULT_FEED_LIMIT,
    cursor: Annotated[
        str | None,
        Query(description="Opaque token from a previous page's next_cursor."),
    ] = None,
) -> ListingFeed:
    """Active food, most urgent first.

    Ordered by expiry rather than recency: the whole point is rescuing food
    before it is wasted, so what is about to disappear belongs at the top.

    Expiry is filtered in the query rather than trusted from `status`. v1 ran a
    sweep first and read the status column, so anything posted between sweeps
    showed up as available after it had expired.

    Paged by keyset on `(expires_at, id)`: pass the `next_cursor` from one page
    back as `cursor` to get the next. Keyset rather than offset because the feed
    changes constantly — offset would skip or repeat rows as listings come and
    go between requests.
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

    if q and q.strip():
        # Case-insensitive substring match across the fields a student would
        # search by. ILIKE is enough here; a campus feed is small and this stays
        # index-simple. (% and _ act as wildcards — acceptable for search.)
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Listing.title.ilike(term),
                Listing.description.ilike(term),
                Listing.building.ilike(term),
                Listing.campus.ilike(term),
            )
        )

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

    if cursor is not None:
        try:
            after_expires_at, after_id = decode_cursor(cursor)
        except ValueError as exc:
            raise ValidationError("That page cursor is not valid") from exc
        # Row-value comparison: resume strictly after the tuple the last page
        # ended on, matching the (expires_at, id) sort order exactly.
        stmt = stmt.where(
            tuple_(Listing.expires_at, Listing.id) > (after_expires_at, after_id)
        )

    # One past the page so we can tell whether a further page exists without a
    # second count query.
    stmt = stmt.order_by(Listing.expires_at.asc(), Listing.id.asc()).limit(limit + 1)

    rows = (await db.scalars(stmt)).all()
    has_more = len(rows) > limit
    page = rows[:limit]

    # The cursor tracks position in the ordered set, not what survives the geo
    # filter — so paging resumes correctly even when the last row of a page is
    # trimmed for being outside the radius.
    next_cursor = (
        encode_cursor(page[-1].expires_at, page[-1].id) if has_more and page else None
    )

    saved = await _saved_ids(db, user.id, [listing.id for listing in page])

    items: list[ListingOut] = []
    for listing in page:
        distance = None
        if located:
            distance = haversine_miles(lat, lng, listing.lat, listing.lng)
            if radius_miles is not None and distance > radius_miles:
                continue  # inside the box, outside the circle
        items.append(
            _serialise(
                listing,
                distance_miles=distance,
                is_saved=listing.id in saved,
            )
        )

    return ListingFeed(items=items, count=len(items), next_cursor=next_cursor)


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


@router.get("/saved", response_model=ListingFeed)
async def saved_feed(db: DbSession, user: CurrentUser) -> ListingFeed:
    """The user's bookmarked listings, most recently saved first.

    Declared before /{listing_id} so "saved" is not parsed as an id.
    """
    stmt = (
        _with_relations(select(Listing))
        .join(SavedListing, SavedListing.listing_id == Listing.id)
        .where(SavedListing.user_id == user.id)
        .order_by(SavedListing.created_at.desc())
        .limit(MAX_FEED_RESULTS)
    )
    rows = (await db.scalars(stmt)).all()
    return ListingFeed(
        items=[_serialise(listing, is_saved=True) for listing in rows],
        count=len(rows),
    )


@router.get("/impact", response_model=HostImpact)
async def host_impact(db: DbSession, organizer: CurrentOrganizer) -> HostImpact:
    """A host's cumulative impact from completed pickups.

    Declared before /{listing_id} so "impact" is not parsed as an id.
    """
    meals = await db.scalar(
        select(func.coalesce(func.sum(Claim.quantity), 0))
        .select_from(Claim)
        .join(Listing, Claim.listing_id == Listing.id)
        .where(
            Listing.organizer_id == organizer.id,
            Claim.status == ClaimStatus.PICKED_UP,
        )
    )
    people = await db.scalar(
        select(func.count(func.distinct(Claim.recipient_id)))
        .select_from(Claim)
        .join(Listing, Claim.listing_id == Listing.id)
        .where(
            Listing.organizer_id == organizer.id,
            Claim.status == ClaimStatus.PICKED_UP,
        )
    )
    active = await db.scalar(
        select(func.count(Listing.id)).where(
            Listing.organizer_id == organizer.id,
            Listing.status == ListingStatus.ACTIVE,
        )
    )
    return HostImpact(
        meals_shared=int(meals or 0),
        people_fed=int(people or 0),
        active_posts=int(active or 0),
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
                except TimeoutError:
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
    listing = await _load(db, listing_id)
    saved = await _saved_ids(db, user.id, [listing.id])
    rating, rating_count = await _host_rating(db, listing.organizer_id)
    interested = await db.scalar(
        select(func.count(SavedListing.id)).where(
            SavedListing.listing_id == listing.id
        )
    )
    return _serialise(
        listing,
        is_saved=listing.id in saved,
        organizer_rating=rating,
        organizer_rating_count=rating_count,
        interested_count=int(interested or 0),
    )


@router.post("/{listing_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def save_listing(
    listing_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> None:
    """Bookmark a listing. Idempotent — saving one already saved is a no-op."""
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("That listing no longer exists")
    # ON CONFLICT DO NOTHING so a double-tap can't 500 on the unique constraint.
    await db.execute(
        pg_insert(SavedListing)
        .values(id=uuid.uuid4(), user_id=user.id, listing_id=listing_id)
        .on_conflict_do_nothing(constraint="uq_saved_per_user")
    )


@router.delete("/{listing_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_listing(
    listing_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> None:
    """Remove a bookmark. Idempotent — removing one that isn't saved is fine."""
    await db.execute(
        delete(SavedListing).where(
            SavedListing.user_id == user.id,
            SavedListing.listing_id == listing_id,
        )
    )


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

    The expiry clock starts when the post goes live — the organizer picks a
    window, and the server computes the deadline. A client-supplied `expires_at`
    would be trivially forgeable.

    `publish` chooses the fate: go live now, save a draft, or schedule for a
    future go-live (when a sweep flips it to active).
    """
    now = datetime.now(UTC)
    window = timedelta(minutes=body.expiry_minutes)

    if body.publish == "draft":
        listing_status = ListingStatus.DRAFT
        scheduled_for = None
        expires_at = now + window  # placeholder; reset when the draft is published
    elif body.publish == "scheduled":
        assert body.scheduled_for is not None  # enforced by the schema validator
        listing_status = ListingStatus.SCHEDULED
        scheduled_for = body.scheduled_for
        expires_at = scheduled_for + window
    else:
        listing_status = ListingStatus.ACTIVE
        scheduled_for = None
        expires_at = now + window

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
        expires_at=expires_at,
        scheduled_for=scheduled_for,
        status=listing_status,
    )
    db.add(listing)
    await db.flush()

    for position, url in enumerate(body.photo_urls):
        db.add(ListingPhoto(listing_id=listing.id, url=url, position=position))

    await db.flush()
    # Only a live post belongs in the feed and on the realtime channel.
    if listing_status is ListingStatus.ACTIVE:
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

    fields = body.model_dump(
        exclude_unset=True, exclude={"location", "status", "quantity_total"}
    )
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
        publishing = (
            target is ListingStatus.ACTIVE and listing.status in rules.PRELIVE
        )
        listing.status = target
        if publishing:
            # The expiry window starts now that it's actually live.
            listing.expires_at = datetime.now(UTC) + timedelta(
                minutes=listing.expiry_minutes
            )
            listing.scheduled_for = None

    await db.flush()
    # Draft/scheduled edits aren't in anyone's feed, so don't wake the realtime
    # channel; everything else broadcasts.
    if listing.status not in rules.PRELIVE:
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
