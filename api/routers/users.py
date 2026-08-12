"""User profile routes."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import (
    CurrentIdentity,
    CurrentUser,
    DbSession,
    rate_limited_by_identity,
)
from api.errors import ConflictError
from api.models import Claim, Listing, User
from api.models.enums import ClaimStatus, ListingStatus, UserRole
from api.schemas.user import ChangeRole, RegisterProfile, UpdateProfile, UserProfile

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


#: Listing states that still owe somebody something. A draft owes nobody — it
#: is invisible to the feed and no one is waiting on it — so it never blocks a
#: switch. Scheduled does, because it will go live on its own with no host.
_UNFINISHED_LISTINGS = (ListingStatus.ACTIVE, ListingStatus.SCHEDULED)


def _count(n: int, one: str, many: str) -> str:
    return f"{n} {one}" if n == 1 else f"{n} {many}"


async def _host_blockers(db: AsyncSession, user_id: str) -> str | None:
    """Why this host can't stop being one yet, or None if nothing is pending."""
    live = await db.scalar(
        select(func.count(Listing.id)).where(
            Listing.organizer_id == user_id,
            Listing.status.in_(_UNFINISHED_LISTINGS),
        )
    )
    # Counted separately rather than inferred from listing status: once every
    # portion is spoken for a listing flips to CLAIMED, which is not in the
    # list above — yet those are exactly the people already walking over.
    waiting = await db.scalar(
        select(func.count(Claim.id))
        .select_from(Claim)
        .join(Listing, Claim.listing_id == Listing.id)
        .where(
            Listing.organizer_id == user_id,
            Claim.status == ClaimStatus.PENDING,
        )
    )
    live, waiting = int(live or 0), int(waiting or 0)
    if not live and not waiting:
        return None

    parts = []
    if live:
        parts.append(f"{_count(live, 'post', 'posts')} still live")
    if waiting:
        parts.append(f"{_count(waiting, 'person', 'people')} waiting to collect")

    # One live post reads "cancel it", not "cancel them" — the message is shown
    # to a person being told to go and do something, and the wrong pronoun on
    # that sentence is the sort of thing that makes an app feel unfinished.
    if live and waiting:
        subject = "them"
    elif live:
        subject = "it" if live == 1 else "them"
    else:
        subject = "that pickup" if waiting == 1 else "those pickups"

    return (
        f"You have {' and '.join(parts)}. Finish or cancel {subject} before "
        "switching to a recipient account — switching now would leave people "
        "with no host."
    )


async def _recipient_blockers(db: AsyncSession, user_id: str) -> str | None:
    """Why this recipient can't stop being one yet, or None."""
    held = await db.scalar(
        select(func.count(Claim.id)).where(
            Claim.recipient_id == user_id,
            Claim.status == ClaimStatus.PENDING,
        )
    )
    held = int(held or 0)
    if not held:
        return None
    return (
        f"You have {_count(held, 'portion', 'portions')} reserved. Collect "
        f"{'it' if held == 1 else 'them'} or cancel the "
        f"{'claim' if held == 1 else 'claims'} before switching to a host "
        "account — a host account can't reach your claims to release them."
    )


@router.post(
    "/me/role",
    response_model=UserProfile,
    responses={409: {"description": "Food still in flight; switch refused"}},
)
async def change_role(
    body: ChangeRole, user: CurrentUser, db: DbSession
) -> User:
    """Switch account type.

    POST, not PUT: the project's CORS allowlist and its API client both carry
    GET/POST/PATCH/DELETE only, and state transitions here are already POSTs
    (/claims/{id}/pickup, /claims/{id}/cancel). A PUT would have needed both
    allowlists widened for one route — and the browser preflight failure that
    revealed it is invisible to pytest, which sends no preflight at all.

    The two roles are the two halves of a handover, so a switch is refused
    while the account still owes someone. A host who walks away from live posts
    leaves recipients arriving at a building nobody can confirm a pickup at
    (the pickup route is organizer-only), and a recipient who walks away from a
    claim leaves a portion reserved that they can no longer release.

    Refused rather than auto-cancelled on purpose: cancelling somebody's dinner
    as a side effect of a settings tap is a worse surprise than being told to
    tidy up first.
    """
    if body.role is user.role:
        return user  # idempotent: asking for the role you have is not an error

    blockers = (
        await _host_blockers(db, user.id)
        if user.role is UserRole.ORGANIZER
        else await _recipient_blockers(db, user.id)
    )
    if blockers:
        raise ConflictError(blockers)

    user.role = body.role
    await db.flush()
    return user
