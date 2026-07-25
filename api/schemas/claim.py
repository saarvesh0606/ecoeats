"""Request and response shapes for claims."""

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from api.geo import maps_url
from api.models.enums import ClaimStatus


class CreateClaim(BaseModel):
    """Reserve one or more portions.

    The recipient is taken from the verified token, not the body. Quantity
    defaults to one; the server caps it at what's actually left.
    """

    listing_id: str
    quantity: int = Field(default=1, ge=1, le=20, description="Portions to reserve.")


class ClaimedListing(BaseModel):
    """Enough of the listing to actually go and collect the food."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    allergens: str | None
    campus: str
    building: str
    room: str | None
    placement_note: str | None
    lat: float
    lng: float
    expires_at: datetime
    photo_urls: list[str] = []

    @computed_field
    @property
    def directions_url(self) -> str:
        """Opens Apple Maps on iOS and Google Maps on Android — the spec's
        "directions link to navigate via phone"."""
        return maps_url(self.lat, self.lng, self.building)


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    listing_id: str
    recipient_id: str
    recipient_name: str
    quantity: int
    status: ClaimStatus
    claimed_at: datetime
    reservation_expires_at: datetime
    resolved_at: datetime | None

    #: Present on a recipient's own claims, where they need the address.
    listing: ClaimedListing | None = None

    #: Whether the recipient has already rated the host for this pickup.
    is_rated: bool = False

    @computed_field
    @property
    def seconds_to_collect(self) -> int:
        """Countdown on the reservation. Zero once it has lapsed."""
        if self.status is not ClaimStatus.PENDING:
            return 0
        delta = (self.reservation_expires_at - datetime.now(UTC)).total_seconds()
        return max(0, int(delta))


class ClaimList(BaseModel):
    items: list[ClaimOut]
    count: int
