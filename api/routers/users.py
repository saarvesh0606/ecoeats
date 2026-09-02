"""User profile routes."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import (
    CurrentIdentity,
    CurrentUser,
    DbSession,
    rate_limited_by_identity,
)
from api.errors import ConflictError
from api.legal import CURRENT_TERMS_VERSION
from api.models import Claim, Listing, User
from api.models.enums import (
    PLACEHOLDER_NAME,
    ClaimStatus,
    ListingStatus,
    UserRole,
    display_name_from_email,
)
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
        name=(
            body.name
            or identity.name
            or display_name_from_email(identity.email)
            or PLACEHOLDER_NAME
        ),
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


@router.post("/me/terms", response_model=UserProfile)
async def accept_terms(user: CurrentUser, db: DbSession) -> User:
    """Record that this user accepted the terms currently in force.

    The version comes from the server, never from the client: a body field
    would let a caller claim to have accepted a document that was never shown
    to them, which is exactly the thing this record exists to rule out.

    Idempotent — accepting twice just refreshes the timestamp.

    The role is recorded alongside the version. A host and a recipient are
    agreeing to different obligations, so switching account type for the first
    time asks again; switching back afterwards does not, because that role is
    already in the list.

    ⚠️ A *new* version resets the list rather than adding to it. Accepting
    v2 as a recipient must not leave a stale "organizer" entry from v1 standing
    in for agreement to a document that has since changed.
    """
    if user.terms_version != CURRENT_TERMS_VERSION:
        user.terms_accepted_roles = [user.role.value]
    elif user.role.value not in user.terms_accepted_roles:
        # Reassigned rather than appended: SQLAlchemy tracks mutation on a
        # replaced list, not on one mutated in place.
        user.terms_accepted_roles = [*user.terms_accepted_roles, user.role.value]

    user.terms_accepted_at = datetime.now(UTC)
    user.terms_version = CURRENT_TERMS_VERSION
    await db.flush()
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    request: Request,
    identity: CurrentIdentity,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete this account and everything belonging to it.

    Required by the App Store for any app with sign-up, and the honest answer
    to "delete my data" regardless.

    Every foreign key pointing at users is ON DELETE CASCADE, so one delete
    takes the listings, claims, ratings, saved posts, notifications and device
    tokens with it.

    ⚠️ A host's live posts go too, and with them other people's claims on that
    food. That is the correct reading of "delete my account" — the alternative
    is leaving posts up that nobody can confirm a pickup for — but it is worth
    knowing before someone deletes an account mid-service.

    The Firebase identity is removed last. If that call fails the row is still
    gone, which is the safer way round: the user can sign in again and will be
    treated as brand new, rather than the data surviving a deletion they were
    told had happened.
    """
    await db.delete(user)
    await db.flush()

    request.app.state.token_verifier.delete(identity.uid)
