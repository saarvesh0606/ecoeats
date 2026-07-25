"""Rating a host after a pickup, and the aggregate shown on the listing."""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing


async def _pickup(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    **overrides: object,
) -> tuple[str, str]:
    """A claim taken to a confirmed pickup. Returns (claim_id, listing_id)."""
    listing = await post_listing(client, organizer, **overrides)
    claim = (
        await client.post(
            "/claims",
            headers=recipient.headers,
            json={"listing_id": listing["id"]},
        )
    ).json()
    r = await client.post(f"/claims/{claim['id']}/pickup", headers=organizer.headers)
    assert r.status_code == 200, r.text
    return claim["id"], listing["id"]


async def test_recipient_rates_host_after_pickup(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    claim_id, listing_id = await _pickup(client, organizer, recipient)

    r = await client.post(
        f"/claims/{claim_id}/rate", headers=recipient.headers, json={"stars": 5}
    )
    assert r.status_code == 201, r.text
    assert r.json()["is_rated"] is True

    detail = await client.get(f"/listings/{listing_id}", headers=recipient.headers)
    org = detail.json()["organizer"]
    assert org["rating"] == 5.0
    assert org["rating_count"] == 1

    mine = await client.get("/claims/mine", headers=recipient.headers)
    assert mine.json()["items"][0]["is_rated"] is True


async def test_cannot_rate_before_pickup(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    claim = (
        await client.post(
            "/claims",
            headers=recipient.headers,
            json={"listing_id": listing["id"]},
        )
    ).json()
    r = await client.post(
        f"/claims/{claim['id']}/rate", headers=recipient.headers, json={"stars": 4}
    )
    assert r.status_code == 400


async def test_cannot_rate_twice(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    claim_id, _ = await _pickup(client, organizer, recipient)
    first = await client.post(
        f"/claims/{claim_id}/rate", headers=recipient.headers, json={"stars": 5}
    )
    second = await client.post(
        f"/claims/{claim_id}/rate", headers=recipient.headers, json={"stars": 3}
    )
    assert first.status_code == 201
    assert second.status_code == 400


async def test_only_the_recipient_can_rate(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    claim_id, _ = await _pickup(client, organizer, recipient)
    r = await client.post(
        f"/claims/{claim_id}/rate",
        headers=client_recipient_two.headers,
        json={"stars": 5},
    )
    assert r.status_code == 403


async def test_stars_out_of_range_rejected(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    claim_id, _ = await _pickup(client, organizer, recipient)
    r = await client.post(
        f"/claims/{claim_id}/rate", headers=recipient.headers, json={"stars": 6}
    )
    assert r.status_code == 422


async def test_average_of_multiple_ratings(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    c1, l1 = await _pickup(client, organizer, recipient, title="A")
    c2, _ = await _pickup(client, organizer, client_recipient_two, title="B")
    await client.post(
        f"/claims/{c1}/rate", headers=recipient.headers, json={"stars": 4}
    )
    await client.post(
        f"/claims/{c2}/rate", headers=client_recipient_two.headers, json={"stars": 5}
    )

    detail = await client.get(f"/listings/{l1}", headers=recipient.headers)
    org = detail.json()["organizer"]
    assert org["rating"] == 4.5
    assert org["rating_count"] == 2
