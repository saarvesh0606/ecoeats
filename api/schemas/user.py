"""Request and response shapes for user profiles."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from api.legal import CURRENT_TERMS_VERSION
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

    terms_accepted_at: datetime | None = None
    terms_version: str | None = None
    terms_accepted_roles: list[str] = Field(default_factory=list)

    @computed_field
    @property
    def terms_current(self) -> bool:
        """Whether this user has accepted the terms now in force, as this role.

        Two conditions, not one. The version catches updated terms; the role
        catches somebody who agreed as a recipient and has since become a host,
        which is a different set of obligations — they are giving food away
        rather than collecting it.

        Computed rather than left to the client so there is one definition of
        "up to date". A client comparing these itself would keep letting people
        in for as long as it took to ship an update.
        """
        return (
            self.terms_version == CURRENT_TERMS_VERSION
            and self.role.value in self.terms_accepted_roles
        )


class RegisterProfile(BaseModel):
    """Body for creating a profile after first sign-in.

    Deliberately has no ``email`` or ``id`` field. Both come from the verified
    token — accepting them from the client is how v1 let a caller post under
    someone else's identity.
    """

    role: UserRole = Field(
        description=(
            "organizer to post surplus food, recipient to claim it. "
            "Decides which interface the account gets. Changeable later via "
            "POST /users/me/role, but not while food is in flight."
        )
    )
    name: str | None = Field(
        default=None,
        max_length=200,
        description="Falls back to the name on the account when omitted.",
    )
    dietary_prefs: list[str] = Field(default_factory=list, max_length=20)


class AppleAuthorization(BaseModel):
    """The one-shot code Apple hands the app at sign-in.

    Exchanged server-side for a refresh token. It is valid for five minutes and
    once only, which is why it is sent at sign-in rather than kept for the
    deletion that will eventually need it.
    """

    authorization_code: str = Field(min_length=1, max_length=2048)


class UpdateProfile(BaseModel):
    """Partial update.

    Role is still absent on purpose, but the reason changed: it is no longer
    permanent, it is *conditional*. Switching account type can strand food
    someone is already walking toward, so it has preconditions to check and a
    409 to raise, none of which fits a partial-update endpoint that silently
    applies whatever it is handed. It lives at POST /users/me/role instead.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    avatar_url: str | None = Field(default=None, max_length=2048)
    dietary_prefs: list[str] | None = Field(default=None, max_length=20)


class ChangeRole(BaseModel):
    """Body for switching account type after registration.

    Separate from UpdateProfile because this is not a preference edit: it
    changes which half of the app the account can reach, and it is refused
    outright while the user has obligations outstanding.
    """

    role: UserRole = Field(
        description=(
            "The account type to switch to. Requesting the current role is a "
            "no-op, not an error."
        )
    )
