"""User accounts, keyed by Firebase UID."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base
from api.models.enums import ALLOWED_EMAIL_DOMAIN, UserRole
from api.models.types import enum_column


class User(Base):
    __tablename__ = "users"

    # Firebase UID — a 28-character opaque string, not a UUID. The identity
    # provider owns this value; we never generate it.
    id: Mapped[str] = mapped_column(String(128), primary_key=True)

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))

    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole, name="userrole"), nullable=False
    )

    # Recipient filtering preference. Not a safety field — see Listing.allergens.
    dietary_prefs: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)), nullable=False, server_default="{}"
    )

    #: When this user accepted the terms, and which version they saw. Both null
    #: until they do. Stored server-side rather than on the device because the
    #: whole point is being able to show who agreed to what, and a flag in local
    #: storage is wiped by a reinstall and absent on a second phone.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    terms_version: Mapped[str | None] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    listings = relationship(
        "Listing", back_populates="organizer", cascade="all, delete-orphan"
    )
    claims = relationship(
        "Claim", back_populates="recipient", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # Defence in depth. The API rejects non-ASU addresses during token
        # verification; this makes it impossible to persist one even if that
        # check is ever bypassed or regressed.
        CheckConstraint(
            f"email LIKE '%%@{ALLOWED_EMAIL_DOMAIN}'",
            name="ck_users_asu_email",
        ),
        # Stored lowercase so the UNIQUE constraint actually prevents
        # duplicates — otherwise Sun@asu.edu and sun@asu.edu are two accounts.
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email} {self.role}>"
