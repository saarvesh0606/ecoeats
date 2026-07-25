"""Ratings — a recipient rating a host after a completed pickup."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


class Rating(Base):
    """One recipient's star rating of a host, tied to the pickup it followed.

    Keyed on the claim so a rating can only exist for a real, completed pickup,
    and only once per pickup.
    """

    __tablename__ = "ratings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    claim_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("claims.id", ondelete="CASCADE"), nullable=False
    )
    host_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    stars: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # One rating per completed pickup.
        UniqueConstraint("claim_id", name="uq_rating_per_claim"),
        CheckConstraint("stars BETWEEN 1 AND 5", name="ck_ratings_stars_range"),
        Index("ix_ratings_host", "host_id"),
    )

    def __repr__(self) -> str:
        return f"<Rating claim={self.claim_id} host={self.host_id} {self.stars}>"
