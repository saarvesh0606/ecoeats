"""Shared test fixtures.

The one rule this file exists to enforce: **a missing database is a failure,
not a skip.**

v1 shipped ~3,500 lines of route tests that silently skipped themselves when no
database was configured, so CI reported green while testing nothing. Every guard
below calls pytest.exit() — the run stops with a non-zero code and an
explanation of how to fix it.
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from api.config import Settings
from api.main import create_app

# Pick up .env so `pytest` works with no shell setup. Real environment
# variables still win — CI sets them directly and must not be overridden.
load_dotenv(override=False)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

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
        pytest.exit(f"TEST_DATABASE_URL is not set.{START_DB_HINT}", returncode=1)
    return url


@pytest.fixture(scope="session")
def settings(test_database_url: str) -> Settings:
    return Settings(
        database_url=test_database_url,
        app_env="test",
        allowed_origins=["http://localhost:8081"],
    )


@pytest.fixture(scope="session", autouse=True)
def migrated_database(settings: Settings) -> None:
    """Bring the test database to head before anything runs.

    Synchronous on purpose: Alembic's env.py drives its own event loop, which
    cannot be started from inside an already-running one.

    Running the real migrations (rather than Base.metadata.create_all) means
    the tests exercise the same DDL that production will get — including every
    CHECK constraint, which is most of what the schema tests below assert on.
    """
    os.environ["ALEMBIC_DATABASE_URL"] = settings.database_url

    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))

    try:
        command.upgrade(config, "head")
    except Exception as exc:  # noqa: BLE001 — re-raised as a hard exit
        pytest.exit(
            f"Could not migrate the test database: {exc}{START_DB_HINT}",
            returncode=1,
        )


@pytest_asyncio.fixture(scope="session")
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — re-raised as a hard exit
        await engine.dispose()
        pytest.exit(
            f"Could not connect to the test database: {exc}{START_DB_HINT}",
            returncode=1,
        )

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """A session wrapped in a transaction that is always rolled back.

    Tests can insert freely and never see each other's rows, with no truncation
    between tests.
    """
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            # A constraint violation aborts the transaction server-side, which
            # deassociates it here. Only roll back one that is still live.
            if transaction.is_active:
                await transaction.rollback()


@pytest_asyncio.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    """An HTTP client wired to the app through ASGI — no network, no live port."""
    app = create_app(settings)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        async with app.router.lifespan_context(app):
            yield ac
