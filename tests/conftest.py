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
from dataclasses import dataclass
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
from api.db import session_dependency
from api.main import create_app
from tests.fake_auth import FakeTokenVerifier, bearer

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
        # Sweeps are driven explicitly in tests. A loop running in the
        # background would mutate rows underneath assertions.
        scheduler_enabled=False,
        # Fixed, fake Cloudinary credentials so the signing endpoint can be
        # tested without reaching the network or reading the real secret.
        cloudinary_cloud_name="test-cloud",
        cloudinary_api_key="000000000000000",
        cloudinary_api_secret="test-secret-do-not-use",
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

    ``join_transaction_mode="create_savepoint"`` is what lets request handlers
    call commit() without escaping this transaction: their commit releases a
    savepoint, and the outer rollback still undoes everything.
    """
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            # A constraint violation aborts the transaction server-side, which
            # deassociates it here. Only roll back one that is still live.
            if transaction.is_active:
                await transaction.rollback()


@pytest.fixture
def auth() -> FakeTokenVerifier:
    """Issues tokens the app will accept, without Firebase or a network."""
    return FakeTokenVerifier()


@pytest_asyncio.fixture
async def client(
    settings: Settings, db: AsyncSession, auth: FakeTokenVerifier
) -> AsyncIterator[AsyncClient]:
    """An HTTP client wired to the app through ASGI — no network, no live port.

    Requests run against the same rolled-back session as the ``db`` fixture, so
    a test can set up rows directly and then exercise them over HTTP.
    """
    app = create_app(settings, token_verifier=auth)

    async def _session_override() -> AsyncIterator[AsyncSession]:
        # Mirrors the production dependency's commit/rollback semantics; both
        # land inside the fixture's savepoint.
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    app.dependency_overrides[session_dependency] = _session_override

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        async with app.router.lifespan_context(app):
            yield ac


@pytest_asyncio.fixture
async def live_client(
    settings: Settings, auth: FakeTokenVerifier, engine: AsyncEngine
) -> AsyncIterator[AsyncClient]:
    """A client whose requests get real, independent database sessions.

    The ordinary ``client`` fixture shares one rolled-back transaction, which
    is fast and isolating but useless for testing locks: concurrent requests
    would all be the same connection and could never contend.

    Here each request takes its own connection and commits for real, so
    ``SELECT ... FOR UPDATE`` does what it does in production. The cost is that
    rows persist, so the table is truncated afterwards.
    """
    app = create_app(settings, token_verifier=auth)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        async with app.router.lifespan_context(app):
            try:
                yield ac
            finally:
                async with engine.begin() as conn:
                    await conn.execute(
                        text(
                            "TRUNCATE users, listings, listing_photos, claims "
                            "RESTART IDENTITY CASCADE"
                        )
                    )


@dataclass(frozen=True)
class Account:
    """A registered user plus the headers to act as them."""

    id: str
    email: str
    headers: dict[str, str]


async def register_account(
    client: AsyncClient, auth: FakeTokenVerifier, role: str, name: str
) -> Account:
    token = auth.issue(name=name)
    headers = bearer(token)
    response = await client.post("/users/me", headers=headers, json={"role": role})
    assert response.status_code == 201, response.text
    body = response.json()
    return Account(id=body["id"], email=body["email"], headers=headers)


@pytest_asyncio.fixture
async def organizer(client: AsyncClient, auth: FakeTokenVerifier) -> Account:
    return await register_account(client, auth, "organizer", "Wrigley Hall Front Desk")


@pytest_asyncio.fixture
async def other_organizer(client: AsyncClient, auth: FakeTokenVerifier) -> Account:
    return await register_account(client, auth, "organizer", "Memorial Union Staff")


@pytest_asyncio.fixture
async def recipient(client: AsyncClient, auth: FakeTokenVerifier) -> Account:
    return await register_account(client, auth, "recipient", "Hungry Student")


@pytest_asyncio.fixture
async def client_recipient_two(
    client: AsyncClient, auth: FakeTokenVerifier
) -> Account:
    """A second recipient, for tests about one user acting on another's data."""
    return await register_account(client, auth, "recipient", "Second Student")
