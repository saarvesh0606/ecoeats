"""The gate every authenticated route sits behind.

The address must be verified — always — and, if the deployment restricts one,
it must sit on the configured domain. Both are enforced in one dependency so no
route can forget them, and these tests are what hold that line.

The domain rule is off by default now. It was ``asu.edu``, hard-coded and
mirrored by a CHECK constraint; it is a setting because it has to be able to
come back (once ASU approves its name being used) without a migration, and
because Apple and Google sign-in hand us addresses on domains we do not choose.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import Settings
from api.db import session_dependency
from api.main import create_app
from tests.fake_auth import FakeTokenVerifier, bearer


@asynccontextmanager
async def restricted_to(
    domain: str, settings: Settings, db: AsyncSession, auth: FakeTokenVerifier
) -> AsyncIterator[AsyncClient]:
    """A client for an app that only accepts one email domain.

    Mirrors the ``app``/``client`` fixtures in conftest, differing only in the
    setting under test — the session override is what keeps these requests
    inside the same rolled-back transaction as everything else.
    """
    # Rebuilt rather than model_copy'd: model_copy skips field validators, and
    # normalising this setting is part of what these tests check.
    restricted = Settings(
        **{**settings.model_dump(), "allowed_email_domain": domain}
    )
    app = create_app(restricted, token_verifier=auth)

    async def _session_override() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[session_dependency] = _session_override

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test/api/v1"
    ) as client:
        async with app.router.lifespan_context(app):
            yield client


# --------------------------------------------------------------------------
# Presenting a token at all
# --------------------------------------------------------------------------


async def test_no_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/users/me")

    assert response.status_code == 401
    assert response.json() == {"message": "Sign in to continue"}


async def test_unrecognised_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/users/me", headers=bearer("not-a-real-token"))

    assert response.status_code == 401


async def test_malformed_authorization_header_is_rejected(
    client: AsyncClient,
) -> None:
    response = await client.get(
        "/users/me", headers={"Authorization": "Basic abc123"}
    )

    assert response.status_code == 401


# --------------------------------------------------------------------------
# The verified-email rule — never optional
# --------------------------------------------------------------------------


async def test_unverified_email_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Anyone can type someone else's address at signup. Until Firebase
    confirms the click, the token proves nothing about who is holding it."""
    token = auth.issue(email="sam@gmail.com", email_verified=False)

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 403
    assert "Confirm your email" in response.json()["message"]


async def test_valid_token_without_a_profile_returns_404(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Not an error — the signal for the client to show role selection, since
    a role cannot be read from a token."""
    token = auth.issue()

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 404


# --------------------------------------------------------------------------
# The domain rule — off by default
# --------------------------------------------------------------------------


async def test_any_verified_address_is_accepted_by_default(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """404 (no profile yet), not 403 — the address itself is no longer a reason
    to refuse anyone. A gmail account is exactly what the app now expects."""
    token = auth.issue(email="someone@gmail.com")

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 404


async def test_an_apple_private_relay_address_is_accepted(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Sign in with Apple hands us this when the user hides their real address.
    Any domain restriction at all would turn that button into a dead end."""
    token = auth.issue(email="a1b2c3d4@privaterelay.appleid.com")

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 404


@pytest_asyncio.fixture
async def asu_only(
    settings: Settings, db: AsyncSession, auth: FakeTokenVerifier
) -> AsyncIterator[AsyncClient]:
    """The restriction as it will be configured if ASU approves."""
    async with restricted_to("asu.edu", settings, db, auth) as client:
        yield client


async def test_a_configured_domain_admits_a_matching_address(
    asu_only: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue(email="sun.devil@asu.edu")

    response = await asu_only.get("/users/me", headers=bearer(token))

    assert response.status_code == 404  # past the gate; no profile yet


async def test_a_configured_domain_refuses_everything_else(
    asu_only: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue(email="someone@gmail.com")

    response = await asu_only.get("/users/me", headers=bearer(token))

    assert response.status_code == 403
    assert "asu.edu" in response.json()["message"]


async def test_a_lookalike_domain_is_refused(
    asu_only: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """A suffix check must not be fooled by a domain that merely contains ours.

    Kept from when the restriction was permanent: the check is dormant now, not
    gone, and it has to still be right the day it is switched back on.
    """
    token = auth.issue(email="attacker@asu.edu.evil.com")

    response = await asu_only.get("/users/me", headers=bearer(token))

    assert response.status_code == 403


async def test_a_blank_setting_means_no_restriction(
    settings: Settings, db: AsyncSession, auth: FakeTokenVerifier
) -> None:
    """An env var set to "" is a host saying "no value", not a domain that
    nothing on earth matches. Read literally it would lock out every account."""
    async with restricted_to("  ", settings, db, auth) as client:
        response = await client.get(
            "/users/me", headers=bearer(auth.issue(email="someone@gmail.com"))
        )

    assert response.status_code == 404
