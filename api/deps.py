"""Request-scoped dependencies: database sessions and the authenticated user."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth.tokens import InvalidTokenError, TokenVerifier, VerifiedIdentity
from api.db import session_dependency
from api.errors import ForbiddenError, NotFoundError, UnauthorizedError
from api.models import User
from api.models.enums import ALLOWED_EMAIL_DOMAIN

# auto_error=False so a missing header raises our own UnauthorizedError with a
# consistent body, rather than FastAPI's differently-shaped 403.
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(session_dependency)]


def get_verifier(request: Request) -> TokenVerifier:
    return request.app.state.token_verifier


async def current_identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
) -> VerifiedIdentity:
    """Verify the bearer token and apply the two rules every account must pass.

    Both checks happen here, before any handler runs, so no route can forget
    them.
    """
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Sign in to continue")

    try:
        identity = verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        raise UnauthorizedError(str(exc)) from exc

    # An unverified address proves nothing — anyone can type someone else's
    # email at signup. Until Firebase confirms the click, it is not an identity.
    if not identity.email_verified:
        raise ForbiddenError(
            "Confirm your email address before continuing. "
            "Check your inbox for the verification link."
        )

    if not identity.email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}"):
        raise ForbiddenError(
            f"EcoEats is for ASU only. Sign in with an @{ALLOWED_EMAIL_DOMAIN} "
            "address."
        )

    return identity


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


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.scalars(select(User).where(User.email == email.lower()))
    return result.one_or_none()
