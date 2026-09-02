"""Request-scoped dependencies: database sessions and the authenticated user."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from api.auth.tokens import InvalidTokenError, TokenVerifier, VerifiedIdentity
from api.db import session_dependency
from api.errors import (
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
    UnauthorizedError,
)
from api.models import User
from api.models.enums import UserRole

# auto_error=False so a missing header raises our own UnauthorizedError with a
# consistent body, rather than FastAPI's differently-shaped 403.
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(session_dependency)]


def get_verifier(request: Request) -> TokenVerifier:
    return request.app.state.token_verifier


def get_allowed_domain(request: Request) -> str | None:
    """The email domain accounts are restricted to, if any.

    ``None`` — the default — means any verified address may hold an account.
    See Settings.allowed_email_domain for why this is configuration.
    """
    return request.app.state.settings.allowed_email_domain


async def current_identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
    allowed_domain: Annotated[str | None, Depends(get_allowed_domain)],
) -> VerifiedIdentity:
    """Verify the bearer token and apply the rules every account must pass.

    They happen here, before any handler runs, so no route can forget them.
    """
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Sign in to continue")
    return await verify_token(credentials.credentials, verifier, allowed_domain)


async def verify_token(
    token: str, verifier: TokenVerifier, allowed_domain: str | None = None
) -> VerifiedIdentity:
    """Verify a token and apply the rules every account must pass.

    Shared by the header-based dependency and the stream endpoint (which reads
    its token from a query parameter, since EventSource can't send headers), so
    both enforce the rules identically.

    ``verify`` is synchronous and can reach the network — for Google's signing
    keys, and for the account record behind a revocation check. Awaiting it in
    a worker thread keeps that off the event loop: this service runs a single
    worker, so a blocking call here stalls every other request, the SSE
    heartbeats and the sweeper along with it.
    """
    try:
        identity = await run_in_threadpool(verifier.verify, token)
    except InvalidTokenError as exc:
        raise UnauthorizedError(str(exc)) from exc

    # An unverified address proves nothing — anyone can type someone else's
    # email at signup. Until Firebase confirms the click, it is not an identity.
    if not identity.email_verified:
        raise ForbiddenError(
            "Confirm your email address before continuing. "
            "Check your inbox for the verification link."
        )

    # Off by default: EcoEats accepts any verified address, and it has to, or
    # the Apple and Google buttons would reject most of the people using them.
    # Set ALLOWED_EMAIL_DOMAIN to bring a restriction back.
    if allowed_domain and not identity.email.endswith(f"@{allowed_domain}"):
        raise ForbiddenError(
            f"EcoEats is currently open to @{allowed_domain} addresses only."
        )

    return identity


async def identity_from_request(request: Request) -> VerifiedIdentity:
    """Resolve an identity from an Authorization header or a `token` query param.

    For the SSE stream: browser EventSource can't set headers, so the web client
    passes the token in the query string; native clients can still use the
    header.
    """
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        token = request.query_params.get("token", "")
    if not token:
        raise UnauthorizedError("Sign in to continue")
    return await verify_token(
        token,
        request.app.state.token_verifier,
        request.app.state.settings.allowed_email_domain,
    )


CurrentIdentity = Annotated[VerifiedIdentity, Depends(current_identity)]


async def current_user(identity: CurrentIdentity, db: DbSession) -> User:
    """The authenticated user's profile row.

    Raises 404 when the token is valid but no profile exists yet — that is the
    signal for the client to send the user to role selection, since a role
    cannot be inferred from a token.
    """
    user = await db.get(User, identity.uid)
    if user is None:
        raise NotFoundError(
            "No profile yet. Choose whether you are posting food or looking "
            "for it to finish setting up."
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def current_organizer(user: CurrentUser) -> User:
    """Restricts a route to accounts that post food.

    v1 had organizer and student roles in the schema and never checked either,
    so any account could create a listing.
    """
    if user.role is not UserRole.ORGANIZER:
        raise ForbiddenError(
            "Only organizer accounts can post food. This account is set up to "
            "claim it."
        )
    return user


CurrentOrganizer = Annotated[User, Depends(current_organizer)]


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.scalars(select(User).where(User.email == email.lower()))
    return result.one_or_none()


def rate_limited(name: str, *, limit: int, window_seconds: int):
    """A per-user rate limit for one action, as a route dependency.

    Keyed on the authenticated user id, not the client IP — so it's precise
    even when hundreds of users share a campus-NAT address. Use it on expensive
    or abusable actions (claiming, posting, upload signing).
    """

    async def dependency(request: Request, user: CurrentUser) -> None:
        await _enforce(request, f"{name}:user:{user.id}", limit, window_seconds)

    return dependency


def rate_limited_by_identity(name: str, *, limit: int, window_seconds: int):
    """Like rate_limited, but keyed on the verified token identity rather than a
    profile — for endpoints that run before a profile exists (registration)."""

    async def dependency(request: Request, identity: CurrentIdentity) -> None:
        await _enforce(request, f"{name}:id:{identity.uid}", limit, window_seconds)

    return dependency


async def _enforce(
    request: Request, key: str, limit: int, window_seconds: int
) -> None:
    settings = request.app.state.settings
    if not settings.rate_limit_enabled:
        return
    result = await request.app.state.limiter.check(
        key, limit=limit, window_seconds=window_seconds
    )
    if not result.allowed:
        raise TooManyRequestsError(retry_after=result.retry_after)
