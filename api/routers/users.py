"""User profile routes."""

from fastapi import APIRouter, Depends, status

from api.deps import (
    CurrentIdentity,
    CurrentUser,
    DbSession,
    rate_limited_by_identity,
)
from api.errors import ConflictError
from api.models import User
from api.schemas.user import RegisterProfile, UpdateProfile, UserProfile

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/me",
    response_model=UserProfile,
    responses={404: {"description": "Authenticated, but no profile yet"}},
)
async def read_me(user: CurrentUser) -> User:
    """The signed-in user's profile.

    A 404 means the token is good but registration is unfinished — the client
    should show role selection.
    """
    return user


@router.post(
    "/me",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(rate_limited_by_identity("register", limit=10, window_seconds=60))
    ],
)
async def register_me(
    body: RegisterProfile, identity: CurrentIdentity, db: DbSession
) -> User:
    """Finish registration by choosing a role.

    Identity fields come from the verified token; the body supplies only what
    the token cannot know.
    """
    existing = await db.get(User, identity.uid)
    if existing is not None:
        raise ConflictError("This account already has a profile")

    user = User(
        id=identity.uid,
        email=identity.email,  # from the token, never the body
        name=body.name or identity.name or identity.email.split("@")[0],
        avatar_url=identity.picture,
        role=body.role,
        dietary_prefs=body.dietary_prefs,
    )
    db.add(user)
    await db.flush()
    return user


@router.patch("/me", response_model=UserProfile)
async def update_me(body: UpdateProfile, user: CurrentUser, db: DbSession) -> User:
    """Update the mutable parts of a profile.

    Role is not among them — see UpdateProfile.
    """
    fields = body.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(user, field, value)

    await db.flush()
    return user
