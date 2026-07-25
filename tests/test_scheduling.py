"""Draft and scheduled posts."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from api.services.claims import activate_scheduled_listings
from tests.conftest import Account, register_account
from tests.fake_auth import FakeTokenVerifier
from tests.test_listings import payload, post_listing


async def test_draft_is_hidden_but_visible_to_host(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    draft = await post_listing(client, organizer, publish="draft")
    assert draft["status"] == "draft"

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["count"] == 0

    mine = await client.get("/listings/mine", headers=organizer.headers)
    assert any(i["status"] == "draft" for i in mine.json()["items"])


async def test_publish_a_draft(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    draft = await post_listing(client, organizer, publish="draft")
    r = await client.patch(
        f"/listings/{draft['id']}",
        headers=organizer.headers,
        json={"status": "active"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["count"] == 1


async def test_scheduled_is_hidden(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    when = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    listing = await post_listing(
        client, organizer, publish="scheduled", scheduled_for=when
    )
    assert listing["status"] == "scheduled"
    assert listing["scheduled_for"] is not None

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["count"] == 0


async def test_scheduling_in_the_past_rejected(
    client: AsyncClient, organizer: Account
) -> None:
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    r = await client.post(
        "/listings",
        headers=organizer.headers,
        json=payload(publish="scheduled", scheduled_for=past),
    )
    assert r.status_code == 422


async def test_scheduled_activates_when_due(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    org = await register_account(live_client, auth, "organizer", "Host")
    rec = await register_account(live_client, auth, "recipient", "Recip")

    when = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    r = await live_client.post(
        "/listings",
        headers=org.headers,
        json=payload(publish="scheduled", scheduled_for=when),
    )
    assert r.status_code == 201, r.text

    # Hidden while scheduled.
    feed = await live_client.get("/listings", headers=rec.headers)
    assert feed.json()["count"] == 0

    # Run the sweep as though it's past the go-live time.
    factory = async_sessionmaker(engine, expire_on_commit=False)
    activated = await activate_scheduled_listings(
        factory, now=datetime.now(UTC) + timedelta(hours=3)
    )
    assert activated == 1

    feed = await live_client.get("/listings", headers=rec.headers)
    assert feed.json()["count"] == 1
