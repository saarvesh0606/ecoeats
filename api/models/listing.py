"""Food listings posted by organizers, and their photos."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base
from api.models.enums import EXPIRY_CHOICES, ListingStatus
from api.models.types import enum_column

_EXPIRY_LIST = ", ".join(str(minutes) for minutes in EXPIRY_CHOICES)


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    organizer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # --- what the food is -------------------------------------------------
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Whether the description came from speech-to-text or was typed. The spec
    # offers both; tracking it tells us whether voice input is worth keeping.
    description_source: Mapped[str] = mapped_column(
        Enum(
            "voice",
            "manual",
            name="descriptionsource",
            native_enum=False,
            create_constraint=True,
            length=10,
        ),
        nullable=False,
        server_default="manual",
    )

    # Free text, and the most safety-critical field in the schema. Kept
    # separate from dietary_tags: tags are for filtering, this is for reading
    # before you eat something.
    allergens: Mapped[str | None] = mapped_column(Text)

    # Filter facets only — "vegetarian", "halal", "gluten-free".
    dietary_tags: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)), nullable=False, server_default="{}"
    )

    # --- how much ---------------------------------------------------------
    # "Feeds 15 people" — portions, not weight.
    quantity_total: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_remaining: Mapped[int] = mapped_column(Integer, nullable=False)

    # --- where ------------------------------------------------------------
    campus: Mapped[str] = mapped_column(String(100), nullable=False)
    building: Mapped[str] = mapped_column(String(200), nullable=False)
    room: Mapped[str | None] = mapped_column(String(100))
    # "on the table by the window" — the detail that means you find the food
    # instead of wandering a floor looking for it.
    placement_note: Mapped[str | None] = mapped_column(Text)

    # Required, not optional. The map is a core feature, and a listing without
    # coordinates cannot appear on it.
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)

    # --- when -------------------------------------------------------------
    expiry_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    status: Mapped[ListingStatus] = mapped_column(
        enum_column(ListingStatus, name="listingstatus"),
        nullable=False,
        server_default=ListingStatus.ACTIVE.value,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    organizer = relationship("User", back_populates="listings")
    photos = relationship(
        "ListingPhoto",
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingPhoto.position",
    )
    claims = relationship(
        "Claim", back_populates="listing", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("quantity_total > 0", name="ck_listings_total_positive"),
        CheckConstraint(
            "quantity_remaining >= 0", name="ck_listings_remaining_non_negative"
        ),
        # The constraint that matters most.
        #
        # v1 had no upper bound here, which is how marking the same no-show
        # twice could refund portions twice and leave a listing advertising
        # more food than ever existed. With this in place that write is
        # rejected by PostgreSQL — the bug cannot be reintroduced by any code
        # path, present or future.
        CheckConstraint(
            "quantity_remaining <= quantity_total",
            name="ck_listings_remaining_within_total",
        ),
        CheckConstraint(
            f"expiry_minutes IN ({_EXPIRY_LIST})",
            name="ck_listings_expiry_choice",
        ),
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_listings_lat_range"),
        CheckConstraint("lng BETWEEN -180 AND 180", name="ck_listings_lng_range"),
        # The feed query: active listings that have not expired, newest first.
        Index("ix_listings_feed", "status", "expires_at"),
        Index("ix_listings_organizer", "organizer_id", "created_at"),
        # Bounding-box lookups for the map.
        Index("ix_listings_location", "lat", "lng"),
    )

    def __repr__(self) -> str:
        return f"<Listing {self.id} {self.title!r} {self.status}>"


class ListingPhoto(Base):
    """A photo attached to a listing.

    Its own table rather than an array column: the spec calls for multiple
    images per post, and photos need stable ordering and individual deletion.
    """

    __tablename__ = "listing_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)

    #: Display order, 0-based. The first photo is the feed thumbnail.
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    listing = relationship("Listing", back_populates="photos")

    __table_args__ = (
        UniqueConstraint("listing_id", "position", name="uq_listing_photo_position"),
        CheckConstraint("position >= 0", name="ck_listing_photos_position"),
    )

    def __repr__(self) -> str:
        return f"<ListingPhoto {self.id} listing={self.listing_id} pos={self.position}>"
