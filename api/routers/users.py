"""User profile routes."""

import logging
from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from api.deps import (
    CurrentIdentity,
    CurrentUser,
    DbSession,
    rate_limited_by_identity,
    verify_token,
)
from api.errors import ConflictError, NotFoundError, ValidationError
from api.legal import CURRENT_TERMS_VERSION
from api.models import Claim, Listing, User
from api.models.enums import (
    PLACEHOLDER_NAME,
    ClaimStatus,
    ListingStatus,
    UserRole,
    display_name_from_email,
)
from api.schemas.user import (
    AppleAuthorization,
    ChangeRole,
    MergeAccount,
    MergeResult,
    RegisterProfile,
    UpdateProfile,
    UserProfile,
)
from api.services.apple import AppleAuthError
from api.services.merge import merge_accounts

router = APIRouter(prefix="/users", tags=["users"])

logger = logging.getLogger(__name__)


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


#: Said to whoever finds their address already spoken for. Deliberately
#: actionable — the way out is to sign in, not to try again.
EMAIL_TAKEN_MESSAGE = "That email address already has an account. Sign in instead."

#: Said when the address is held by a row nobody can sign into any more, but
#: which has a history worth keeping. Recovering it means deciding what happens
#: to that history, which is a person's judgement, not a route's.
STRANDED_ACCOUNT_MESSAGE = (
    "That email address belongs to an older account that can no longer sign "
    "in, and it still has food history attached. Email hello@ecoeatsapp.com "
    "and we'll move it across."
)


async def _has_history(db: AsyncSession, user_id: str) -> bool:
    """Whether this profile has ever given or taken food.

    Only listings and claims count. Everything else that hangs off a user —
    devices, saved items, notifications, a role — describes the account rather
    than anything it did, and none of it is worth a person's time to recover.
    """
    listings = await db.scalar(
        select(func.count(Listing.id)).where(Listing.organizer_id == user_id)
    )
    claims = await db.scalar(
        select(func.count(Claim.id)).where(Claim.recipient_id == user_id)
    )
    return bool(listings or claims)


async def _release_if_stranded(
    request: Request, db: AsyncSession, holder: User
) -> None:
    """Free an address whose account can never be signed into again.

    An identity deleted from the Firebase console — which reads like a clean
    reset and is the opposite — leaves its profile row behind. The row still
    owns the address, so signing up again mints a new uid and collides forever:
    the person is locked out of their own address by a row nobody can reach.

    Reclaiming it is safe because of what the caller has already proved. Every
    request past `current_identity` carries a *verified* address, so whoever is
    asking demonstrably controls that mailbox — and the row they would displace
    belongs to an identity that no longer exists and cannot be signed into by
    anyone, ever. Nothing is taken from anybody.

    Two things it refuses to do. It will not touch a row with listings or
    claims behind it — addresses get reassigned, university ones especially,
    and handing one person another's food history is worse than a lockout. And
    it will not act on a Firebase it could not reach: "don't know" is not
    "gone", so an outage refuses the registration instead of deleting a live
    profile.
    """
    verifier = request.app.state.token_verifier
    try:
        # Blocking network call, so off the event loop — this service runs one
        # worker and a stall here stalls every other request. Same reasoning as
        # token verification in api.deps.
        signs_in = await run_in_threadpool(verifier.identity_exists, holder.id)
    except Exception as exc:
        logger.warning(
            "Could not establish whether identity %s still exists: %s",
            holder.id,
            type(exc).__name__,
        )
        raise ConflictError(EMAIL_TAKEN_MESSAGE) from exc

    if signs_in:
        raise ConflictError(EMAIL_TAKEN_MESSAGE)

    if await _has_history(db, holder.id):
        raise ConflictError(STRANDED_ACCOUNT_MESSAGE)

    await db.delete(holder)
    await db.flush()
    logger.info(
        "Released %s from stranded profile %s: the identity no longer exists "
        "and nothing was attached to it",
        holder.email,
        holder.id,
    )


@router.post(
    "/me",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "The uid or the address already has one"}},
    dependencies=[
        Depends(rate_limited_by_identity("register", limit=10, window_seconds=60))
    ],
)
async def register_me(
    body: RegisterProfile,
    request: Request,
    identity: CurrentIdentity,
    db: DbSession,
) -> User:
    """Finish registration by choosing a role.

    Identity fields come from the verified token; the body supplies only what
    the token cannot know.
    """
    existing = await db.get(User, identity.uid)
    if existing is not None:
        raise ConflictError("This account already has a profile")

    # The uid above is not the only way an account can already exist: the
    # address is unique too, and a row holds one under a *different* uid
    # whenever a sign-in identity was deleted while its profile stayed. The
    # INSERT then broke the unique constraint and the unhandled IntegrityError
    # surfaced as a 500, which told the person nothing and left the address
    # looking permanently broken.
    holder = await db.scalar(select(User).where(User.email == identity.email))
    if holder is not None:
        # Either refuses, or clears the way and lets registration continue.
        await _release_if_stranded(request, db, holder)

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
    try:
        await db.flush()
    except IntegrityError as exc:
        # The check above races — two registrations of one address can both
        # read it as free — so the constraint is what actually arbitrates. The
        # pre-check only saves the common case a rollback.
        await db.rollback()
        if "users_email_key" in str(exc.orig):
            raise ConflictError(EMAIL_TAKEN_MESSAGE) from exc
        raise
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


@router.post("/me/apple-authorization", status_code=status.HTTP_204_NO_CONTENT)
async def store_apple_authorization(
    request: Request,
    body: AppleAuthorization,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Trade Apple's one-shot code for a refresh token and keep it.

    Only so the authorisation can be withdrawn when this account is deleted,
    which Apple requires of any app offering deletion. Nothing reads it
    otherwise.

    Nothing here is allowed to fail the sign-in that triggered it. The user is
    already authenticated by the time this runs; a code Apple will not honour,
    or Apple being unreachable, costs a revocation later — not a way in now.
    """
    apple = request.app.state.apple
    if apple is None:
        return  # not configured; revocation is dormant

    try:
        user.apple_refresh_token = await apple.exchange_code(
            body.authorization_code
        )
    except AppleAuthError:
        logger.warning("Could not exchange Apple's code for %s", user.id)


@router.post("/me/merge", response_model=MergeResult)
async def merge_into_me(
    request: Request,
    body: MergeAccount,
    identity: CurrentIdentity,
    user: CurrentUser,
    db: DbSession,
) -> MergeResult:
    """Fold another account of the same person into this one.

    The account making the request survives; the one whose token is in the body
    is absorbed and deleted. Both halves are proved: the caller is authenticated
    as the survivor, and holding a valid token for the other is what proves they
    control it too. Neither is taken on the client's word.

    Why this exists: Apple's "Hide My Email" gives a relay address that cannot
    be matched to somebody's real one, so one person signing in two ways becomes
    two accounts with no way for us to tell. Linking prevents new ones; this
    cleans up a pair that already exist.

    ⚠️ It cannot be undone. Everything moves in one transaction, and the
    absorbed account and its identity are gone at the end of it.
    """
    other = await verify_token(
        body.token,
        request.app.state.token_verifier,
        request.app.state.settings.allowed_email_domain,
    )

    if other.uid == identity.uid:
        raise ValidationError("That is the account you are already signed in to.")

    absorbed = await db.get(User, other.uid)
    if absorbed is None:
        # Nothing to merge. They wanted linking, which is the safe operation,
        # and saying so is more useful than reporting an empty success.
        raise NotFoundError(
            "That account has no EcoEats profile, so there is nothing to move. "
            "Link it from Settings instead."
        )

    summary = await merge_accounts(
        db, keep_id=user.id, absorb_id=absorbed.id
    )

    await db.delete(absorbed)
    await db.flush()

    # Last, and allowed to fail: the rows are already moved, and leaving a
    # signed-out identity behind is far better than reporting a failure for a
    # merge that actually happened.
    request.app.state.token_verifier.delete(other.uid)

    return MergeResult(**asdict(summary))


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
    # Before the row goes, because the token goes with it. Apple requires the
    # authorisation to be withdrawn when an account is deleted, and without it
    # Apple stops re-prompting — so someone who deletes and signs up again is
    # silently given no name and no email, which is how this was found.
    await _revoke_apple(request, user)

    await db.delete(user)
    await db.flush()

    request.app.state.token_verifier.delete(identity.uid)


async def _revoke_apple(request: Request, user: User) -> None:
    """Withdraw the Apple authorisation, if there is one and we can.

    Never allowed to fail the deletion. Someone asking for their account to be
    gone must not be told it failed because a third party was unreachable — the
    row and the identity are what they asked to be rid of, and both still go.
    """
    apple = request.app.state.apple
    if apple is None or not user.apple_refresh_token:
        return
    try:
        await apple.revoke(user.apple_refresh_token)
    except AppleAuthError:
        logger.warning("Could not revoke Apple for %s; deleting anyway", user.id)
