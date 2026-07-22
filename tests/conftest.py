"""Shared test fixtures.

The one rule this file exists to enforce: **a missing database is a failure,
not a skip.**

v1 shipped ~3,500 lines of route tests that silently skipped themselves when no
database was configured, so CI reported green while testing nothing. Every guard
below calls pytest.exit() — the run stops with a non-zero code and an
explanation of how to fix it.
"""

import os

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from api.config import Settings
from api.main import create_app

# Pick up .env so `pytest` works with no shell setup. Real environment
# variables still win — CI sets them directly and must not be overridden.
load_dotenv(override=False)

START_DB_HINT = (
    "\n"
    "  The test suite needs a running PostgreSQL instance.\n"
    "\n"
    "    docker compose up -d db\n"
    "\n"
    "  Then set TEST_DATABASE_URL (or copy .env.example to .env):\n"
    "\n"
    "    postgresql://ecoeats:ecoeats@localhost:5432/ecoeats_test\n"
)


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.exit(
            f"TEST_DATABASE_URL is not set.{START_DB_HINT}",
            returncode=1,
        )
    return url


@pytest.fixture(scope="session")
def settings(test_database_url: str) -> Settings:
    return Settings(
        database_url=test_database_url,
        app_env="test",
        allowed_origins=["http://localhost:8081"],
    )


@pytest_asyncio.fixture(scope="session", autouse=True)
async def verify_database_reachable(settings: Settings) -> None:
    """Connect once, before anything else runs. Unreachable database ends the
    run immediately rather than letting every test fail with its own noise."""
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — we re-raise as a hard exit
        pytest.exit(
            f"Could not connect to the test database: {exc}{START_DB_HINT}",
            returncode=1,
        )
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(settings: Settings) -> AsyncClient:
    """An HTTP client wired to the app through ASGI — no network, no live port."""
    app = create_app(settings)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        async with app.router.lifespan_context(app):
            yield ac
