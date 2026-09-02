"""User accounts, keyed by Firebase UID."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base
from api.models.enums import UserRole
from api.models.types import enum_column


class User(Base):
    __tablename__ = "users"

    # Firebase UID — a 28-character opaque string, not a UUID. The identity
    # provider owns this value; we never generate it.
    id: Mapped[str] = mapped_column(String(128), primary_key=True)

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))

    # Apple's refresh token, kept for exactly one purpose: revoking the
    # authorisation when this account is deleted, which Apple requires of any
    # app offering deletion. Null for everyone who did not sign in with Apple.
    #
    # ⚠ It is a credential. It cannot read anything about the person, but
    # anyone holding it plus our signing key could revoke their authorisation —
    # so it is written by the server from a one-shot code, never accepted from
    # a client, and goes when the row goes.
    apple_refresh_token: Mapped[str | None] = mapped_column(String(512))

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

    #: Which roles this user has accepted the terms *as*.
    #:
    #: A host and a recipient are agreeing to different things — one is giving
    #: food away, the other is collecting and eating it, and the obligations in
    #: the terms differ accordingly. So someone who switches account type for
    #: the first time is asked again, and switching back later is not.
    terms_accepted_roles: Mapped[list[str]] = mapped_column(
        ARRAY(String(20)), nullable=False, server_default="{}"
    )

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
        # Stored lowercase so the UNIQUE constraint actually prevents
        # duplicates — otherwise Sam@gmail.com and sam@gmail.com are two
        # accounts.
        #
        # There is deliberately no domain constraint here. There was one, for
        # asu.edu, and it had to be dropped: a CHECK cannot follow a setting,
        # so it would have pinned the schema to a rule the app no longer makes.
        # Domain restriction now lives in Settings.allowed_email_domain, which
        # is checked during token verification.
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email} {self.role}>"
