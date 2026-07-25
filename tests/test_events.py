"""Real-time listing events: the bus, and publishing on mutations.

Replaces polling. The bus tests cover both backends; the HTTP tests prove that
a claim actually broadcasts, and that the SSE stream authenticates.
"""

import asyncio
import os

import pytest
from httpx import AsyncClient

from api.events import InMemoryEventBus, ListingEvent, RedisEventBus
from tests.conftest import Account
from tests.test_listings import post_listing

SAMPLE = ListingEvent(
    listing_id="abc", quantity_remaining=4, status="active",
    expires_at="2026-01-01T00:00:00+00:00",
)


def _token_of(account: Account) -> str:
    return account.headers["Authorization"].split(" ", 1)[1]


# --------------------------------------------------------------------------
# In-memory bus
# --------------------------------------------------------------------------


async def test_in_memory_bus_delivers_to_a_subscriber() -> None:
    bus = InMemoryEventBus()
    async with bus.subscribe() as events:
        await bus.publish(SAMPLE)
        got = await asyncio.wait_for(events.get(), timeout=1)
    assert got == SAMPLE


async def test_in_memory_bus_delivers_to_every_subscriber() -> None:
    bus = InMemoryEventBus()
    async with bus.subscribe() as a, bus.subscribe() as b:
        await bus.publish(SAMPLE)
        got_a = await asyncio.wait_for(a.get(), timeout=1)
        got_b = await asyncio.wait_for(b.get(), timeout=1)
    assert got_a == got_b == SAMPLE


async def test_unsubscribed_queues_stop_receiving() -> None:
    bus = InMemoryEventBus()
    async with bus.subscribe():
        pass  # subscription ended
    # No subscribers left; publishing must not raise.
    await bus.publish(SAMPLE)


def test_event_round_trips_through_json() -> None:
    assert ListingEvent.from_json(SAMPLE.to_json()) == SAMPLE


# --------------------------------------------------------------------------
# Redis bus (real Redis, own DB)
# --------------------------------------------------------------------------

REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")


@pytest.fixture
async def redis_bus():
    try:
        import redis.asyncio as redis_async
    except ImportError:  # pragma: no cover
        pytest.skip("redis client not installed")

    client = redis_async.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
    except Exception:  # noqa: BLE001
        await client.aclose()
        pytest.skip("Redis not reachable — start it with `docker compose up -d redis`")

    bus = RedisEventBus(client)
    await bus.start()
    yield bus
    await bus.close()


async def test_redis_bus_fans_out_through_pubsub(redis_bus) -> None:
    async with redis_bus.subscribe() as events:
        # The subscription registers a local queue; give the pub/sub reader a
        # moment to be listening before publishing.
        await asyncio.sleep(0.1)
        await redis_bus.publish(SAMPLE)
        got = await asyncio.wait_for(events.get(), timeout=3)
    assert got == SAMPLE


# --------------------------------------------------------------------------
# Publishing on mutations
# --------------------------------------------------------------------------


async def test_claiming_broadcasts_the_new_quantity(
    app, client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """A claim must reach every connected client — the whole point of the bus."""
    listing = await post_listing(client, organizer, quantity_total=5)
    bus = app.state.event_bus

    async with bus.subscribe() as events:
        await client.post(
            "/claims",
            headers=recipient.headers,
            json={"listing_id": listing["id"]},
        )
        # Publishing happens in a background task after the response; httpx runs
        # those before returning, so the event is already queued.
        event = await asyncio.wait_for(events.get(), timeout=2)

    assert event.listing_id == listing["id"]
    assert event.quantity_remaining == 4  # 5 - 1
    assert event.status == "active"


async def test_posting_a_listing_broadcasts_it(
    app, client: AsyncClient, organizer: Account
) -> None:
    bus = app.state.event_bus
    async with bus.subscribe() as events:
        created = await post_listing(client, organizer, quantity_total=8)
        event = await asyncio.wait_for(events.get(), timeout=2)

    assert event.listing_id == created["id"]
    assert event.quantity_remaining == 8


# --------------------------------------------------------------------------
# The SSE stream endpoint
# --------------------------------------------------------------------------


async def test_stream_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/listings/stream")
    assert response.status_code == 401


async def test_stream_rejects_a_bad_token(client: AsyncClient) -> None:
    response = await client.get("/listings/stream?token=not-a-real-token")
    assert response.status_code == 401


# NOTE: the *live* SSE stream (opening comment, event delivery, heartbeat) is
# not tested here. httpx's ASGITransport buffers the whole response instead of
# streaming, so it can never consume an endless stream — it just hangs. The
# streaming is verified against a real uvicorn server instead (see the manual
# check in the commit); what unit tests cover is the auth gate above and the
# publish path, which together exercise everything except the socket itself.
