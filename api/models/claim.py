"""Claims — a recipient reserving a portion from a listing."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base
from api.models.enums import ClaimStatus
from api.models.types import enum_column


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False
    )
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # The spec reserves one portion per claim. The column stays flexible in
    # case that changes, but the API pins it to 1.
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    status: Mapped[ClaimStatus] = mapped_column(
        enum_column(ClaimStatus, name="claimstatus"),
        nullable=False,
        server_default=ClaimStatus.PENDING.value,
    )

    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # When the reservation lapses and the portion returns to the pool.
    #
    # v1 stored this and never once read it, so a recipient who never turned up
    # removed a portion from circulation permanently while the food sat there.
    reservation_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Set when the claim leaves `pending`, whichever way it goes.
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    listing = relationship("Listing", back_populates="claims")
    recipient = relationship("User", back_populates="claims")

    __table_args__ = (
        # One claim per person per listing, enforced by PostgreSQL.
        #
        # We rely on this rather than a SELECT-then-INSERT check, which has a
        # race between the two statements: two concurrent requests can both
        # read "no existing claim" before either writes.
        UniqueConstraint("listing_id", "recipient_id", name="uq_claim_per_recipient"),
        CheckConstraint("quantity > 0", name="ck_claims_quantity_positive"),
        # A claim is either pending, or resolved with a timestamp. Nothing in
        # between — this is what keeps the release logic honest.
        CheckConstraint(
            "(status = 'pending' AND resolved_at IS NULL) "
            "OR (status <> 'pending' AND resolved_at IS NOT NULL)",
            name="ck_claims_resolved_at_matches_status",
        ),
        Index("ix_claims_recipient", "recipient_id", "claimed_at"),
        Index("ix_claims_listing", "listing_id"),
        # Drives the sweep that releases lapsed reservations.
        Index("ix_claims_reservation_expiry", "status", "reservation_expires_at"),
    )

    def __repr__(self) -> str:
        return f"<Claim {self.id} listing={self.listing_id} {self.status}>"
