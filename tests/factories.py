"""Builders for valid model instances.

Each returns an object that satisfies every constraint, so a test can change
exactly the one field it is making a claim about and attribute any failure to
that change.
"""

import uuid
from datetime import UTC, datetime, timedelta

from api.models import Claim, Listing, ListingPhoto, User
from api.models.enums import RESERVATION_MINUTES, ClaimStatus, ListingStatus, UserRole

# Wrigley Hall, ASU Tempe.
TEMPE_LAT = 33.4225
TEMPE_LNG = -111.9330


def make_user(
    *,
    role: UserRole = UserRole.RECIPIENT,
    email: str | None = None,
    name: str = "Test User",
) -> User:
    # Firebase UIDs are opaque strings, not UUIDs — mirror that shape here.
    uid = uuid.uuid4().hex[:28]
    return User(
        id=uid,
        email=email if email is not None else f"{uid}@asu.edu",
        name=name,
        role=role,
    )


def make_listing(
    *,
    organizer: User,
    quantity_total: int = 15,
    quantity_remaining: int | None = None,
    expiry_minutes: int = 30,
    status: ListingStatus = ListingStatus.ACTIVE,
) -> Listing:
    return Listing(
        organizer_id=organizer.id,
        title="Leftover pizza",
        description="15 leftover pizzas, vegetarian and pepperoni.",
        allergens="Contains gluten, dairy. Prepared in a kitchen handling nuts.",
        dietary_tags=["vegetarian"],
        quantity_total=quantity_total,
        quantity_remaining=(
            quantity_total if quantity_remaining is None else quantity_remaining
        ),
        campus="Tempe",
        building="Wrigley Hall",
        room="205",
        placement_note="On the table by the window",
        lat=TEMPE_LAT,
        lng=TEMPE_LNG,
        expiry_minutes=expiry_minutes,
        expires_at=datetime.now(UTC) + timedelta(minutes=expiry_minutes),
        status=status,
    )


def make_claim(
    *,
    listing: Listing,
    recipient: User,
    quantity: int = 1,
    status: ClaimStatus = ClaimStatus.PENDING,
    resolved_at: datetime | None = None,
) -> Claim:
    return Claim(
        listing_id=listing.id,
        recipient_id=recipient.id,
        quantity=quantity,
        status=status,
        reservation_expires_at=(
            datetime.now(UTC) + timedelta(minutes=RESERVATION_MINUTES)
        ),
        resolved_at=resolved_at,
    )


def make_photo(*, listing: Listing, position: int = 0) -> ListingPhoto:
    return ListingPhoto(
        listing_id=listing.id,
        url=f"https://storage.example.com/{uuid.uuid4()}.jpg",
        position=position,
    )
