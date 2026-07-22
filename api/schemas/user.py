"""Request and response shapes for user profiles."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from api.models.enums import UserRole


class UserProfile(BaseModel):
    """A user profile as returned to clients.

    Note what is absent: no reputation score, no impact stats. v1 carried both
    and never wrote to either.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    avatar_url: str | None
    role: UserRole
    dietary_prefs: list[str]
    created_at: datetime


class RegisterProfile(BaseModel):
    """Body for creating a profile after first sign-in.

    Deliberately has no ``email`` or ``id`` field. Both come from the verified
    token — accepting them from the client is how v1 let a caller post under
    someone else's identity.
    """

    role: UserRole = Field(
        description=(
            "organizer to post surplus food, recipient to claim it. "
            "Permanent — it decides which interface the account gets."
        )
    )
    name: str | None = Field(
        default=None,
        max_length=200,
        description="Falls back to the name on the account when omitted.",
    )
    dietary_prefs: list[str] = Field(default_factory=list, max_length=20)


class UpdateProfile(BaseModel):
    """Partial update. Role is absent on purpose — it is a permanent account
    type, not a preference."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    avatar_url: str | None = Field(default=None, max_length=2048)
    dietary_prefs: list[str] | None = Field(default=None, max_length=20)
