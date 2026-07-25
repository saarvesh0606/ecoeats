"""Free-text search over the recipient feed (the `q` query parameter)."""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing


async def test_search_matches_title(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer, title="Vegan Tacos")
    await post_listing(client, organizer, title="Chicken Sandwich")

    r = await client.get("/listings", params={"q": "taco"}, headers=recipient.headers)
    assert [i["title"] for i in r.json()["items"]] == ["Vegan Tacos"]


async def test_search_is_case_insensitive_and_matches_location(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(
        client, organizer, title="Soup", location={"building": "Hayden Library"}
    )
    await post_listing(
        client, organizer, title="Wraps", location={"building": "Memorial Union"}
    )

    r = await client.get("/listings", params={"q": "HAYDEN"}, headers=recipient.headers)
    assert [i["title"] for i in r.json()["items"]] == ["Soup"]


async def test_search_matches_description(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(
        client, organizer, title="Mystery box", description="Freshly baked sourdough."
    )
    await post_listing(client, organizer, title="Other", description="Plain rice.")

    r = await client.get(
        "/listings", params={"q": "sourdough"}, headers=recipient.headers
    )
    assert [i["title"] for i in r.json()["items"]] == ["Mystery box"]


async def test_empty_search_returns_everything(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer, title="One")
    await post_listing(client, organizer, title="Two")

    r = await client.get("/listings", params={"q": "  "}, headers=recipient.headers)
    assert r.json()["count"] == 2
