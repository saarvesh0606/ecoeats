"""In-app notifications — recent activity a user should know about."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


class Notification(Base):
    """One line of activity for a user — a claim on their post, a confirmed
    pickup, a new rating. Read in-app; native push is a later addition."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(String(300), nullable=False)

    #: What happened, so the client can pick an icon without parsing prose.
    #: Deriving this from the message text would break the first time someone
    #: reworded a string, and silently — the row would just lose its icon.
    #: Rows written before this column existed default to "activity", which
    #: the client renders with the generic bell it always used.
    kind: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="activity"
    )

    #: The listing this is about, for tap-through. SET NULL if it ever goes.
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL")
    )

    read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ix_notifications_user", "user_id", "created_at"),)

    def __repr__(self) -> str:
        return f"<Notification user={self.user_id} {self.message!r}>"
