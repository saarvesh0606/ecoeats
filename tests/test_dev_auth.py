"""The development auth bypass, and its production lock.

The bypass is a deliberate hole in authentication, so the tests that matter
most are the ones proving it cannot open in production and that it does not
weaken any rule other than token verification.
"""

import pytest

from api.auth.dev import DevTokenVerifier
from api.auth.tokens import InvalidTokenError, VerifiedIdentity
from api.config import Settings
from api.main import _build_verifier


def test_dev_token_becomes_a_verified_asu_identity() -> None:
    identity = DevTokenVerifier().verify("dev:organizer")

    assert identity.uid == "dev-organizer"
    assert identity.email == "organizer@asu.edu"
    assert identity.email_verified is True  # so it passes the normal gate
    assert identity.name == "Organizer"


def test_dev_verifier_delegates_real_tokens_to_the_fallback() -> None:
    class StubFallback:
        def verify(self, token: str) -> VerifiedIdentity:
            return VerifiedIdentity(
                uid="real", email="real@asu.edu", email_verified=True
            )

    identity = DevTokenVerifier(fallback=StubFallback()).verify("a-real-token")
    assert identity.uid == "real"


def test_dev_verifier_without_a_fallback_rejects_real_tokens() -> None:
    with pytest.raises(InvalidTokenError):
        DevTokenVerifier().verify("not-a-dev-token")


def test_malformed_dev_slugs_are_rejected() -> None:
    for bad in ["dev:", "dev:has space", "dev:sql'inject", "dev:a/b", "dev:.."]:
        with pytest.raises(InvalidTokenError):
            DevTokenVerifier().verify(bad)


def test_dev_slug_case_is_normalised() -> None:
    """Uppercase input is lowercased, not rejected — 'Organizer' and
    'organizer' are the same dev account, not two."""
    assert DevTokenVerifier().verify("dev:Organizer").uid == "dev-organizer"


def test_production_refuses_to_start_with_the_bypass_on() -> None:
    """The one that keeps this out of production. If this ever fails, the app
    would boot in prod accepting tokens that impersonate anyone."""
    settings = Settings(
        database_url="postgresql://x/y",
        app_env="production",
        dev_auth_bypass=True,
        firebase_project_id="p",
        firebase_credentials_path="secrets/firebase-service-account.json",
    )

    with pytest.raises(RuntimeError, match="never be enabled in production"):
        _build_verifier(settings)


async def test_dev_login_reaches_a_real_profile_end_to_end() -> None:
    """A dev token drives the whole normal flow: register a role, read it back.

    Uses a fresh app wired with the DevTokenVerifier, against the real test
    database, to prove the bypass integrates rather than just unit-tests.
    """
    import os

    from httpx import ASGITransport, AsyncClient

    from api.auth.dev import DevTokenVerifier
    from api.main import create_app

    settings = Settings(
        database_url=os.environ["TEST_DATABASE_URL"],
        app_env="development",
        scheduler_enabled=False,
    )
    app = create_app(settings, token_verifier=DevTokenVerifier())
    headers = {"Authorization": "Bearer dev:e2e-organizer"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        async with app.router.lifespan_context(app):
            # No profile yet.
            first = await client.get("/users/me", headers=headers)
            assert first.status_code == 404

            created = await client.post(
                "/users/me", headers=headers, json={"role": "organizer"}
            )
            assert created.status_code == 201
            assert created.json()["email"] == "e2e-organizer@asu.edu"
            assert created.json()["role"] == "organizer"

            # Clean up so the shared dev database doesn't accumulate the row.
            from sqlalchemy import delete

            from api.models import User

            async with app.state.session_factory() as session:
                await session.execute(
                    delete(User).where(User.id == "dev-e2e-organizer")
                )
                await session.commit()
