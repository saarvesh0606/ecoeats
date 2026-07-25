"""Saved listings — a user bookmarking food to come back to."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


class SavedListing(Base):
    """A user's bookmark of a listing.

    Its own table (rather than an array on the user) so saves can be added and
    removed independently and joined into the feed to mark what's already saved.
    """

    __tablename__ = "saved_listings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # One save per user per listing; saving twice is a no-op, not a row.
        UniqueConstraint("user_id", "listing_id", name="uq_saved_per_user"),
        Index("ix_saved_user", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<SavedListing user={self.user_id} listing={self.listing_id}>"
