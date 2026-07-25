"""Listing state rules, in one place.

v1 scattered status checks across route handlers and got them inconsistent —
cancel rejected `claimed`, update accepted it, and nothing checked expiry at
all. Every transition goes through :func:`assert_can_transition` here.
"""

from datetime import UTC, datetime

from api.errors import ConflictError
from api.models import Listing
from api.models.enums import ListingStatus

#: Which statuses a listing may move to from each status.
#:
#: `claimed -> active` is permitted on purpose: an organizer who marks a post
#: out of stock and then finds more food should not have to repost it.
TRANSITIONS: dict[ListingStatus, frozenset[ListingStatus]] = {
    # Draft and scheduled posts are published by going active, or dropped.
    ListingStatus.DRAFT: frozenset(
        {ListingStatus.ACTIVE, ListingStatus.CANCELLED}
    ),
    ListingStatus.SCHEDULED: frozenset(
        {ListingStatus.ACTIVE, ListingStatus.CANCELLED}
    ),
    ListingStatus.ACTIVE: frozenset({ListingStatus.CLAIMED, ListingStatus.CANCELLED}),
    ListingStatus.CLAIMED: frozenset({ListingStatus.ACTIVE, ListingStatus.CANCELLED}),
    ListingStatus.EXPIRED: frozenset(),
    ListingStatus.CANCELLED: frozenset(),
}

#: Statuses that aren't live yet — hidden from the feed, always editable.
PRELIVE = frozenset({ListingStatus.DRAFT, ListingStatus.SCHEDULED})

TERMINAL = frozenset({ListingStatus.EXPIRED, ListingStatus.CANCELLED})


def assert_can_transition(current: ListingStatus, target: ListingStatus) -> None:
    if current == target:
        return  # idempotent — asking for the state you are already in is fine
    if target not in TRANSITIONS[current]:
        raise ConflictError(
            f"A listing that is {current.value} cannot become {target.value}"
        )


def has_expired(listing: Listing, *, now: datetime | None = None) -> bool:
    """Whether the clock has run out, regardless of the stored status.

    Read from `expires_at` rather than trusting `status`, so correctness never
    depends on a background sweep having run recently.
    """
    now = now or datetime.now(UTC)
    return listing.expires_at <= now


def is_live(listing: Listing, *, now: datetime | None = None) -> bool:
    """Claimable right now: marked active, in date, and with food left."""
    return (
        listing.status is ListingStatus.ACTIVE
        and not has_expired(listing, now=now)
        and listing.quantity_remaining > 0
    )


def assert_editable(listing: Listing) -> None:
    """Terminal listings are history — they do not change."""
    if listing.status in TERMINAL:
        raise ConflictError(f"This listing is {listing.status.value} and cannot change")
    # Drafts and scheduled posts aren't live, so their placeholder expiry doesn't
    # gate editing — the clock only matters once they go active.
    if listing.status in PRELIVE:
        return
    if has_expired(listing):
        raise ConflictError("This listing has expired and cannot change")


def portions_spoken_for(listing: Listing) -> int:
    return listing.quantity_total - listing.quantity_remaining


def apply_new_total(listing: Listing, new_total: int) -> None:
    """Resize a listing while preserving portions already claimed.

    An organizer who finds more food raises the total; one who overestimated
    lowers it. Either way the claimed portions stay claimed, so the adjustment
    lands entirely on what is still available.
    """
    claimed = portions_spoken_for(listing)
    if new_total < claimed:
        raise ConflictError(
            f"{claimed} portion(s) are already claimed, so the total cannot "
            f"drop below {claimed}"
        )
    listing.quantity_total = new_total
    listing.quantity_remaining = new_total - claimed
