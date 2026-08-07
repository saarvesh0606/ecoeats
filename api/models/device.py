"""Push targets — the devices a user has asked to be notified on."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


class DeviceToken(Base):
    """One Expo push token belonging to one user.

    A user can have several: a phone and a tablet, or the same phone after a
    reinstall. Delivery fans out to all of them.

    The token is unique across the whole table rather than per user, because
    reinstalling an app or handing a phone on can move a token between
    accounts. Whoever registered it last owns it, and the previous owner must
    lose it — otherwise the old account keeps pushing to a device that now
    belongs to someone else.
    """

    __tablename__ = "device_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    #: An Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    #: "ios", "android" or "web" — only for diagnosing delivery problems.
    platform: Mapped[str | None] = mapped_column(String(16))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    #: Refreshed every time the app re-registers, so stale devices are findable.
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ix_device_tokens_user", "user_id"),)

    def __repr__(self) -> str:
        return f"<DeviceToken user={self.user_id} {self.token[:24]!r}>"
