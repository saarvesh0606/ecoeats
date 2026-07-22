"""Request and response shapes for listings."""

from datetime import UTC, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from api.models.enums import EXPIRY_CHOICES, ListingStatus

ExpiryMinutes = Literal[15, 20, 30, 45, 60]
assert set(EXPIRY_CHOICES) == set(ExpiryMinutes.__args__)  # keep the two in step

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class LocationIn(BaseModel):
    """Where the food is, precisely enough to actually find it."""

    campus: str = Field(min_length=1, max_length=100, examples=["Tempe"])
    building: str = Field(min_length=1, max_length=200, examples=["Wrigley Hall"])
    room: str | None = Field(default=None, max_length=100, examples=["205"])
    placement_note: str | None = Field(
        default=None,
        max_length=500,
        description="Where in the room, e.g. 'on the table by the window'.",
    )
    lat: Latitude
    lng: Longitude


class CreateListing(BaseModel):
    title: str = Field(min_length=1, max_length=200, examples=["Leftover pizza"])
    description: str = Field(
        min_length=1,
        max_length=2000,
        examples=["15 leftover pizzas, vegetarian and pepperoni."],
    )
    description_source: Literal["voice", "manual"] = "manual"

    allergens: str | None = Field(
        default=None,
        max_length=1000,
        description=(
            "Allergens, ingredients and dietary restrictions, in plain words. "
            "Free text on purpose — a tag list cannot express 'made in a "
            "kitchen that also handles nuts'."
        ),
    )
    dietary_tags: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Filter facets only. Safety information belongs in allergens.",
    )

    quantity_total: int = Field(
        gt=0,
        le=1000,
        description="How many people this feeds.",
        examples=[15],
    )
    expiry_minutes: ExpiryMinutes = Field(
        description="How long the post stays up before it disappears."
    )

    location: LocationIn
    photo_urls: list[str] = Field(default_factory=list, max_length=10)


class UpdateListing(BaseModel):
    """Partial edit. The spec lets organizers change a post any time it is live.

    ``quantity_total`` resizes the listing while leaving claimed portions
    untouched; see services.listings.apply_new_total.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    allergens: str | None = Field(default=None, max_length=1000)
    dietary_tags: list[str] | None = Field(default=None, max_length=20)
    quantity_total: int | None = Field(default=None, gt=0, le=1000)
    location: LocationIn | None = None
    status: Literal["active", "claimed"] | None = Field(
        default=None,
        description=(
            "Set to 'claimed' to mark the food gone before it expires — the "
            "spec's 'out of stock'. Cancelling has its own endpoint."
        ),
    )

    @model_validator(mode="after")
    def _at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self


class Organizer(BaseModel):
    """Who posted it. Joined from users, never denormalised onto the listing."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class ListingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    allergens: str | None
    dietary_tags: list[str]

    quantity_total: int
    quantity_remaining: int

    campus: str
    building: str
    room: str | None
    placement_note: str | None
    lat: float
    lng: float

    expires_at: datetime
    status: ListingStatus
    created_at: datetime

    organizer: Organizer
    photo_urls: list[str] = Field(default_factory=list)

    #: Straight-line miles from the requester. Present only when the request
    #: supplied a location.
    distance_miles: float | None = None

    @computed_field
    @property
    def seconds_remaining(self) -> int:
        """Never negative. The client counts down locally from this, which is
        why time remaining needs no realtime channel of its own."""
        delta = (self.expires_at - datetime.now(UTC)).total_seconds()
        return max(0, int(delta))

    @computed_field
    @property
    def is_claimable(self) -> bool:
        """Whether claiming would succeed right now.

        Derived rather than stored: a listing whose clock ran out is not
        claimable even if a sweep has not yet flipped its status.
        """
        return (
            self.status is ListingStatus.ACTIVE
            and self.quantity_remaining > 0
            and self.seconds_remaining > 0
        )


class ListingFeed(BaseModel):
    items: list[ListingOut]
    count: int
