"""Proves the whole loop works: app boots, routes respond, Postgres is reachable."""

from httpx import AsyncClient


async def test_health_reports_ok(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_reaches_the_database(client: AsyncClient) -> None:
    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "connected"}


async def test_unknown_route_is_a_clean_404(client: AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404
