"""Host impact stats, computed from completed pickups."""

from httpx import AsyncClient

from api.schemas.listing import HostImpact
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
    # Weight is derived from the portions actually collected, so the claim that
    # was never picked up must not add weight either.
    assert body["pounds_saved"] == 1.2


async def test_impact_starts_at_zero(
    client: AsyncClient, organizer: Account
) -> None:
    body = (await client.get("/listings/impact", headers=organizer.headers)).json()
    assert body == {
        "meals_shared": 0,
        "people_fed": 0,
        "active_posts": 0,
        "pounds_saved": 0.0,
    }


def test_pounds_are_derived_and_rounded() -> None:
    """Weight is an estimate off the portion count — nothing is ever weighed.

    Pinned as a unit test because the figure is reported publicly: it has to
    track `meals_shared` exactly, and it has to stay at one decimal so the UI
    never has to render 6.000000000000001 lbs.
    """
    assert HostImpact(meals_shared=0, people_fed=0, active_posts=0).pounds_saved == 0.0
    assert HostImpact(meals_shared=5, people_fed=1, active_posts=0).pounds_saved == 6.0
    # 7 * 1.2 is 8.399999999999999 in binary floating point.
    assert HostImpact(meals_shared=7, people_fed=1, active_posts=0).pounds_saved == 8.4


async def test_impact_requires_organizer(
    client: AsyncClient, recipient: Account
) -> None:
    r = await client.get("/listings/impact", headers=recipient.headers)
    assert r.status_code == 403
