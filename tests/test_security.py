"""Security headers and production surface reduction."""

from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.main import create_app


async def test_responses_carry_hardening_headers(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


async def test_hsts_is_absent_outside_production(client: AsyncClient) -> None:
    """HSTS over local HTTP would pin the browser to HTTPS for a host that
    doesn't serve it."""
    response = await client.get("/health")
    assert "strict-transport-security" not in response.headers


async def test_docs_are_served_in_development(client: AsyncClient) -> None:
    assert (await client.get("/docs")).status_code == 200
    assert (await client.get("/openapi.json")).status_code == 200


def _production_app(test_database_url: str):
    # Production requires Firebase; point it at the real service-account file so
    # the app can construct. Loading the cert is local — no network call.
    settings = Settings(
        database_url=test_database_url,
        app_env="production",
        firebase_project_id="ecoeats-f09a8",
        firebase_credentials_path="secrets/firebase-service-account.json",
        scheduler_enabled=False,
        dev_auth_bypass=False,  # overrides the dev .env; never on in production
        rate_limit_enabled=False,
    )
    return create_app(settings)


async def test_docs_are_disabled_in_production(test_database_url: str) -> None:
    """The OpenAPI schema maps the whole attack surface; don't publish it."""
    app = _production_app(test_database_url)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        async with app.router.lifespan_context(app):
            assert (await ac.get("/docs")).status_code == 404
            assert (await ac.get("/openapi.json")).status_code == 404


async def test_hsts_present_in_production(test_database_url: str) -> None:
    app = _production_app(test_database_url)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        async with app.router.lifespan_context(app):
            response = await ac.get("/health")
    assert "strict-transport-security" in response.headers
