"""Proves the whole loop works: app boots, routes respond, Postgres is reachable."""

from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.main import create_app


async def test_health_reports_ok(client: AsyncClient) -> None:
    # /health is unversioned (infra endpoint) — absolute URL bypasses the
    # client's /api/v1 base.
    response = await client.get("http://test/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_reaches_the_database(client: AsyncClient) -> None:
    response = await client.get("http://test/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "connected"}


async def test_unknown_route_is_a_clean_404(client: AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404


async def test_the_version_endpoint_names_the_running_commit() -> None:
    """The whole point of the endpoint: one request, directly comparable to
    `git rev-parse HEAD`.

    No Authorization header is sent, and that is the test as much as the body
    is — a deploy check that needs a token is one that does not get run, and
    this is what you reach for when something is already wrong.
    """
    app = create_app(
        Settings(
            database_url="postgresql+asyncpg://user:pw@localhost:5432/db",
            git_commit="704cf4f",
            render_git_branch="main",
            app_env="staging",
            scheduler_enabled=False,
        )
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get("/health/version")

    assert response.status_code == 200
    assert response.json() == {
        "revision": "704cf4f",
        "environment": "staging",
        "branch": "main",
    }


async def test_the_version_endpoint_omits_a_branch_it_was_not_given() -> None:
    app = create_app(
        Settings(
            database_url="postgresql+asyncpg://user:pw@localhost:5432/db",
            git_commit="abc1234",
            render_git_branch="",
            scheduler_enabled=False,
        )
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        body = (await ac.get("/health/version")).json()

    assert "branch" not in body
    assert body["revision"] == "abc1234"
