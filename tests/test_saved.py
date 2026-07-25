"""Saving (bookmarking) listings, and the is_saved flag on listing responses."""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing

MISSING = "00000000-0000-4000-8000-000000000000"


async def test_save_and_unsave_toggles_is_saved(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    lid = listing["id"]

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["items"][0]["is_saved"] is False

    r = await client.post(f"/listings/{lid}/save", headers=recipient.headers)
    assert r.status_code == 204

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["items"][0]["is_saved"] is True
    detail = await client.get(f"/listings/{lid}", headers=recipient.headers)
    assert detail.json()["is_saved"] is True

    r = await client.delete(f"/listings/{lid}/save", headers=recipient.headers)
    assert r.status_code == 204

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["items"][0]["is_saved"] is False


async def test_saving_twice_is_idempotent(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    lid = listing["id"]
    first = await client.post(f"/listings/{lid}/save", headers=recipient.headers)
    second = await client.post(f"/listings/{lid}/save", headers=recipient.headers)
    assert first.status_code == 204
    assert second.status_code == 204

    saved = await client.get("/listings/saved", headers=recipient.headers)
    assert saved.json()["count"] == 1


async def test_saved_feed_lists_only_my_saves(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    a = await post_listing(client, organizer, title="Bagels")
    b = await post_listing(client, organizer, title="Salad")
    await client.post(f"/listings/{a['id']}/save", headers=recipient.headers)
    await client.post(f"/listings/{b['id']}/save", headers=client_recipient_two.headers)

    mine = await client.get("/listings/saved", headers=recipient.headers)
    assert [i["title"] for i in mine.json()["items"]] == ["Bagels"]


async def test_save_missing_listing_is_404(
    client: AsyncClient, recipient: Account
) -> None:
    r = await client.post(f"/listings/{MISSING}/save", headers=recipient.headers)
    assert r.status_code == 404


async def test_unsave_missing_is_still_204(
    client: AsyncClient, recipient: Account
) -> None:
    # Removing a bookmark that was never there is a no-op, not an error.
    r = await client.delete(f"/listings/{MISSING}/save", headers=recipient.headers)
    assert r.status_code == 204
