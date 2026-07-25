"""Claiming food: the transaction, the state machine, and the release paths."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Claim, Listing
from api.models.enums import ListingStatus
from tests.conftest import Account
from tests.test_listings import post_listing


async def claim(client: AsyncClient, account: Account, listing_id: str):
    return await client.post(
        "/claims", headers=account.headers, json={"listing_id": listing_id}
    )


# ---------------------------------------------------------------------------
# Claiming
# ---------------------------------------------------------------------------


async def test_claiming_reserves_a_portion(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=15)

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["quantity"] == 1
    assert body["seconds_to_collect"] > 0

    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 14


async def test_claim_includes_where_to_collect(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The spec's confirmation with pickup location and directions."""
    listing = await post_listing(client, organizer)

    body = (await claim(client, recipient, listing["id"])).json()

    assert body["listing"]["building"] == "Wrigley Hall"
    assert body["listing"]["placement_note"] == "On the table by the window"
    assert body["listing"]["allergens"] is not None
    assert body["listing"]["directions_url"].startswith("https://maps.google.com/")


async def test_organizers_do_not_claim_food(
    client: AsyncClient, organizer: Account, other_organizer: Account
) -> None:
    listing = await post_listing(client, organizer)

    response = await claim(client, other_organizer, listing["id"])

    assert response.status_code == 403


async def test_the_same_person_cannot_claim_twice(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    await claim(client, recipient, listing["id"])

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 409
    assert "already claimed" in response.json()["message"]


async def test_last_portion_marks_the_listing_claimed(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=1)

    await claim(client, recipient, listing["id"])

    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 0
    assert after.json()["status"] == "claimed"
    assert after.json()["is_claimable"] is False


async def test_cannot_claim_an_expired_listing_before_a_sweep_runs(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    db: AsyncSession,
) -> None:
    """v1 checked the status column, which a background job maintained, so
    food that expired between sweeps stayed claimable."""
    listing = await post_listing(client, organizer)

    row = await db.get(Listing, listing["id"])
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    # status left as "active", as if no sweep had run
    await db.flush()

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 409
    assert "expired" in response.json()["message"]


async def test_cannot_claim_a_withdrawn_listing(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    await client.post(f"/listings/{listing['id']}/cancel", headers=organizer.headers)

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 409


async def test_cannot_claim_what_is_gone(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    db: AsyncSession,
) -> None:
    listing = await post_listing(client, organizer, quantity_total=1)
    row = await db.get(Listing, listing["id"])
    assert row is not None
    row.quantity_remaining = 0
    await db.flush()

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Pickup
# ---------------------------------------------------------------------------


async def test_organizer_confirms_pickup(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    response = await client.post(
        f"/claims/{created['id']}/pickup", headers=organizer.headers
    )

    assert response.status_code == 200
    assert response.json()["status"] == "picked_up"
    assert response.json()["resolved_at"] is not None


async def test_pickup_does_not_give_the_portion_back(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """Collected food is gone. Only no-show and cancel return inventory."""
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    await client.post(f"/claims/{created['id']}/pickup", headers=organizer.headers)

    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 4


async def test_only_the_posting_organizer_confirms_pickup(
    client: AsyncClient,
    organizer: Account,
    other_organizer: Account,
    recipient: Account,
) -> None:
    listing = await post_listing(client, organizer)
    created = (await claim(client, recipient, listing["id"])).json()

    response = await client.post(
        f"/claims/{created['id']}/pickup", headers=other_organizer.headers
    )

    assert response.status_code == 403


async def test_pickup_cannot_be_confirmed_twice(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()
    await client.post(f"/claims/{created['id']}/pickup", headers=organizer.headers)

    response = await client.post(
        f"/claims/{created['id']}/pickup", headers=organizer.headers
    )

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Releasing portions — the v1 bug
# ---------------------------------------------------------------------------


async def test_no_show_returns_the_portion(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    response = await client.post(
        f"/claims/{created['id']}/no-show", headers=organizer.headers
    )

    assert response.status_code == 200
    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 5


async def test_no_show_twice_does_not_refund_twice(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """**The v1 inventory-inflation bug.**

    v1 had no transition guard, so calling no-show repeatedly added the
    portions back each time and left a listing advertising more food than had
    ever existed. Guarded here, and the schema's
    ck_listings_remaining_within_total would reject the write even if the guard
    were removed.
    """
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    first = await client.post(
        f"/claims/{created['id']}/no-show", headers=organizer.headers
    )
    second = await client.post(
        f"/claims/{created['id']}/no-show", headers=organizer.headers
    )

    assert first.status_code == 200
    assert second.status_code == 409

    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 5  # not 6


async def test_no_show_after_pickup_is_refused(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """Otherwise a collected portion is handed back to the pool."""
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()
    await client.post(f"/claims/{created['id']}/pickup", headers=organizer.headers)

    response = await client.post(
        f"/claims/{created['id']}/no-show", headers=organizer.headers
    )

    assert response.status_code == 409
    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 4


async def test_releasing_reopens_a_sold_out_listing(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=1)
    created = (await claim(client, recipient, listing["id"])).json()

    after_claim = await client.get(
        f"/listings/{listing['id']}", headers=recipient.headers
    )
    assert after_claim.json()["status"] == "claimed"

    await client.post(f"/claims/{created['id']}/no-show", headers=organizer.headers)

    after_release = await client.get(
        f"/listings/{listing['id']}", headers=recipient.headers
    )
    assert after_release.json()["status"] == "active"


async def test_releasing_does_not_resurrect_a_withdrawn_listing(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    db: AsyncSession,
) -> None:
    """v1 set the listing back to `active` unconditionally, which brought
    cancelled and expired posts back into the feed."""
    listing = await post_listing(client, organizer, quantity_total=1)
    created = (await claim(client, recipient, listing["id"])).json()
    await client.post(f"/listings/{listing['id']}/cancel", headers=organizer.headers)

    await client.post(f"/claims/{created['id']}/no-show", headers=organizer.headers)

    row = await db.get(Listing, listing["id"])
    assert row is not None
    await db.refresh(row)
    assert row.status is ListingStatus.CANCELLED


# ---------------------------------------------------------------------------
# Recipient cancelling — the gap in the spec
# ---------------------------------------------------------------------------


async def test_recipient_can_release_their_own_claim(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """Absent from the feature spec. Without it, one person who changes their
    mind shrinks a listing permanently while the food sits there."""
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    response = await client.post(
        f"/claims/{created['id']}/cancel", headers=recipient.headers
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    after = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert after.json()["quantity_remaining"] == 5


async def test_cancelling_frees_the_slot_to_claim_again(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The unique constraint is per (listing, recipient) regardless of status,
    so a cancelled claim still blocks a second one. Worth knowing explicitly."""
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()
    await client.post(f"/claims/{created['id']}/cancel", headers=recipient.headers)

    response = await claim(client, recipient, listing["id"])

    assert response.status_code == 409


async def test_one_recipient_cannot_cancel_anothers_claim(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    created = (await claim(client, recipient, listing["id"])).json()

    response = await client.post(
        f"/claims/{created['id']}/cancel", headers=client_recipient_two.headers
    )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Listing views
# ---------------------------------------------------------------------------


async def test_recipient_sees_their_claims(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    await claim(client, recipient, listing["id"])

    response = await client.get("/claims/mine", headers=recipient.headers)

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["items"][0]["listing"]["building"] == "Wrigley Hall"


async def test_organizer_sees_who_is_collecting(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    await claim(client, recipient, listing["id"])
    await claim(client, client_recipient_two, listing["id"])

    response = await client.get(
        f"/listings/{listing['id']}/claims", headers=organizer.headers
    )

    assert response.status_code == 200
    assert response.json()["count"] == 2
    names = {item["recipient_name"] for item in response.json()["items"]}
    assert names == {"Hungry Student", "Second Student"}


async def test_organizers_cannot_read_each_others_claims(
    client: AsyncClient,
    organizer: Account,
    other_organizer: Account,
    recipient: Account,
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    await claim(client, recipient, listing["id"])

    response = await client.get(
        f"/listings/{listing['id']}/claims", headers=other_organizer.headers
    )

    assert response.status_code == 403


async def test_claims_are_scoped_to_their_owner(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    client_recipient_two: Account,
    db: AsyncSession,
) -> None:
    listing = await post_listing(client, organizer, quantity_total=5)
    await claim(client, recipient, listing["id"])

    response = await client.get("/claims/mine", headers=client_recipient_two.headers)

    assert response.json()["count"] == 0
    rows = (await db.scalars(select(Claim))).all()
    assert len(rows) == 1
