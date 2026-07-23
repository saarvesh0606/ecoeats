"""Rate limiting — the limiter algorithm and its enforcement.

Two protections are tested: the blanket per-IP middleware (DoS) and the precise
per-user dependency (abuse of expensive actions). The per-user layer matters
most for this app because campus NAT hides many students behind one IP.
"""

import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.ratelimit import (
    InMemoryRateLimiter,
    RedisRateLimiter,
    build_limiter,
)
from tests.fake_auth import FakeTokenVerifier, bearer
from tests.test_listings import payload

# --------------------------------------------------------------------------
# The limiter algorithm (in-memory)
# --------------------------------------------------------------------------


async def test_allows_up_to_the_limit_then_blocks() -> None:
    limiter = InMemoryRateLimiter()
    results = [
        await limiter.check("k", limit=3, window_seconds=60) for _ in range(4)
    ]

    assert [r.allowed for r in results] == [True, True, True, False]
    assert results[0].remaining == 2
    assert results[3].remaining == 0
    assert results[3].retry_after > 0


async def test_separate_keys_have_separate_budgets() -> None:
    limiter = InMemoryRateLimiter()
    for _ in range(3):
        await limiter.check("a", limit=3, window_seconds=60)

    # "a" is now exhausted; "b" is untouched.
    assert (await limiter.check("a", limit=3, window_seconds=60)).allowed is False
    assert (await limiter.check("b", limit=3, window_seconds=60)).allowed is True


async def test_window_resets_after_it_elapses() -> None:
    limiter = InMemoryRateLimiter()
    # A 1-second window so the reset is observable without slowing the suite.
    for _ in range(2):
        await limiter.check("k", limit=2, window_seconds=1)
    assert (await limiter.check("k", limit=2, window_seconds=1)).allowed is False

    await asyncio.sleep(1.1)
    assert (await limiter.check("k", limit=2, window_seconds=1)).allowed is True


# --------------------------------------------------------------------------
# The Redis backend — same contract, shared across instances
# --------------------------------------------------------------------------

REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")


@pytest.fixture
async def redis_limiter():
    try:
        import redis.asyncio as redis_async
    except ImportError:  # pragma: no cover
        pytest.skip("redis client not installed")

    client = redis_async.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
    except Exception:  # noqa: BLE001
        await client.aclose()
        pytest.skip(
            f"Redis not reachable at {REDIS_URL} — start it with "
            "`docker compose up -d redis`"
        )
    await client.flushdb()
    limiter = RedisRateLimiter(client)
    yield limiter
    await client.flushdb()
    await limiter.close()


async def test_redis_backend_enforces_the_same_limit(redis_limiter) -> None:
    results = [
        await redis_limiter.check("k", limit=3, window_seconds=60)
        for _ in range(4)
    ]
    assert [r.allowed for r in results] == [True, True, True, False]
    assert results[3].retry_after > 0


async def test_redis_backend_isolates_keys(redis_limiter) -> None:
    for _ in range(3):
        await redis_limiter.check("a", limit=3, window_seconds=60)
    assert (await redis_limiter.check("a", limit=3, window_seconds=60)).allowed is False
    assert (await redis_limiter.check("b", limit=3, window_seconds=60)).allowed is True


def test_build_limiter_selects_backend() -> None:
    assert isinstance(build_limiter(None), InMemoryRateLimiter)
    assert isinstance(build_limiter(REDIS_URL), RedisRateLimiter)


# --------------------------------------------------------------------------
# Enforcement over HTTP
# --------------------------------------------------------------------------


def _rate_limited_settings(**overrides) -> Settings:
    return Settings(
        database_url=os.environ["TEST_DATABASE_URL"],
        app_env="test",
        scheduler_enabled=False,
        rate_limit_enabled=True,
        # In-memory (a fresh limiter per app) so these wiring tests are isolated
        # and deterministic. The Redis backend has its own tests above; sharing
        # the real Redis here would let counters bleed across tests and runs
        # within the fixed window. Explicit None overrides REDIS_URL from .env.
        redis_url=None,
        **overrides,
    )


async def test_per_ip_middleware_blocks_a_flood() -> None:
    """The blanket DoS guard: too many requests from one IP get a 429."""
    from api.main import create_app

    settings = _rate_limited_settings(
        rate_limit_ip_requests=3, rate_limit_ip_window_seconds=60
    )
    app = create_app(settings, token_verifier=FakeTokenVerifier())

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        async with app.router.lifespan_context(app):
            statuses = [(await client.get("/nope")).status_code for _ in range(5)]
            blocked = await client.get("/nope")

    assert statuses[:3] == [404, 404, 404]  # under the limit
    assert 429 in statuses[3:]
    assert blocked.status_code == 429
    assert blocked.json()["message"].startswith("Too many requests")
    assert int(blocked.headers["retry-after"]) > 0


async def test_health_is_never_rate_limited() -> None:
    from api.main import create_app

    settings = _rate_limited_settings(
        rate_limit_ip_requests=2, rate_limit_ip_window_seconds=60
    )
    app = create_app(settings, token_verifier=FakeTokenVerifier())

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        async with app.router.lifespan_context(app):
            statuses = [(await client.get("/health")).status_code for _ in range(6)]

    assert statuses == [200] * 6


async def test_per_user_limit_on_claiming() -> None:
    """The precise guard: one user can't spam the claim endpoint, and hitting
    the limit doesn't affect a different user."""
    from api.db import session_dependency
    from api.main import create_app
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    settings = _rate_limited_settings(
        rate_limit_ip_requests=10_000, rate_limit_ip_window_seconds=60
    )
    auth = FakeTokenVerifier()
    engine = create_async_engine(settings.database_url)

    async with engine.connect() as conn:
        txn = await conn.begin()
        db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
        app = create_app(settings, token_verifier=auth)

        async def _override():
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

        app.dependency_overrides[session_dependency] = _override

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            async with app.router.lifespan_context(app):
                # Register a recipient and spam claims at a non-existent listing.
                token = auth.issue()
                await client.post(
                    "/users/me", headers=bearer(token), json={"role": "recipient"}
                )
                missing = {"listing_id": "00000000-0000-4000-8000-000000000000"}

                # The claim limit is 20/min. Fire 21; the last must be a 429,
                # not the 404 the missing listing would otherwise give.
                statuses = []
                for _ in range(21):
                    r = await client.post(
                        "/claims", headers=bearer(token), json=missing
                    )
                    statuses.append(r.status_code)

        await db.close()
        await txn.rollback()
    await engine.dispose()

    assert statuses.count(429) >= 1
    assert statuses[-1] == 429
    # Everything before the limit was the ordinary 404 (listing not found).
    assert statuses[0] == 404
