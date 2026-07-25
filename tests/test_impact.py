"""Host impact stats, computed from completed pickups."""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing


async def test_impact_counts_only_picked_up(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    a = await post_listing(client, organizer, title="A")
    b = await post_listing(client, organizer, title="B")
    ca = (
        await client.post(
            "/claims", headers=recipient.headers, json={"listing_id": a["id"]}
        )
    ).json()
    # A claim that is never picked up must not count.
    await client.post(
        "/claims",
        headers=client_recipient_two.headers,
        json={"listing_id": b["id"]},
    )
    await client.post(f"/claims/{ca['id']}/pickup", headers=organizer.headers)

    body = (await client.get("/listings/impact", headers=organizer.headers)).json()
    assert body["meals_shared"] == 1
    assert body["people_fed"] == 1
    assert body["active_posts"] == 2


async def test_impact_starts_at_zero(
    client: AsyncClient, organizer: Account
) -> None:
    body = (await client.get("/listings/impact", headers=organizer.headers)).json()
    assert body == {"meals_shared": 0, "people_fed": 0, "active_posts": 0}


async def test_impact_requires_organizer(
    client: AsyncClient, recipient: Account
) -> None:
    r = await client.get("/listings/impact", headers=recipient.headers)
    assert r.status_code == 403
