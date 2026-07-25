"""Claiming more than one portion at a time."""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing


async def test_claim_multiple_portions(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=10)
    r = await client.post(
        "/claims",
        headers=recipient.headers,
        json={"listing_id": listing["id"], "quantity": 3},
    )
    assert r.status_code == 201, r.text
    assert r.json()["quantity"] == 3

    after = await client.get(
        f"/listings/{listing['id']}", headers=recipient.headers
    )
    assert after.json()["quantity_remaining"] == 7


async def test_default_quantity_is_one(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    r = await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )
    assert r.json()["quantity"] == 1


async def test_claim_more_than_available_rejected(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=2)
    r = await client.post(
        "/claims",
        headers=recipient.headers,
        json={"listing_id": listing["id"], "quantity": 5},
    )
    assert r.status_code == 409
