"""Listing creation, the recipient feed, and organizer edits."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Listing
from api.models.enums import ListingStatus
from tests.conftest import Account

# Wrigley Hall, ASU Tempe.
WRIGLEY = (33.4225, -111.9330)
# Memorial Union, about 0.3 miles away.
MEMORIAL_UNION = (33.4185, -111.9345)
# Downtown Phoenix campus, roughly 9 miles north.
DOWNTOWN = (33.4520, -112.0740)


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Leftover pizza",
        "description": "15 leftover pizzas, vegetarian and pepperoni.",
        "allergens": "Contains gluten and dairy. Kitchen also handles nuts.",
        "dietary_tags": ["vegetarian"],
        "quantity_total": 15,
        "expiry_minutes": 30,
        "location": {
            "campus": "Tempe",
            "building": "Wrigley Hall",
            "room": "205",
            "placement_note": "On the table by the window",
            "lat": WRIGLEY[0],
            "lng": WRIGLEY[1],
        },
        "photo_urls": [],
    }
    location = overrides.pop("location", None)
    if location:
        body["location"].update(location)
    body.update(overrides)
    return body


async def post_listing(
    client: AsyncClient, organizer: Account, **overrides: Any
) -> dict[str, Any]:
    response = await client.post(
        "/listings", headers=organizer.headers, json=payload(**overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Creating
# ---------------------------------------------------------------------------


async def test_organizer_can_post_food(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    assert body["title"] == "Leftover pizza"
    assert body["quantity_total"] == 15
    assert body["quantity_remaining"] == 15
    assert body["status"] == "active"
    assert body["is_claimable"] is True
    assert body["organizer"]["name"] == "Wrigley Hall Front Desk"
    # Every location field the spec asks for.
    assert body["campus"] == "Tempe"
    assert body["building"] == "Wrigley Hall"
    assert body["placement_note"] == "On the table by the window"


async def test_recipients_cannot_post_food(
    client: AsyncClient, recipient: Account
) -> None:
    """v1 had roles in the schema and enforced neither."""
    response = await client.post(
        "/listings", headers=recipient.headers, json=payload()
    )

    assert response.status_code == 403
    assert "organizer" in response.json()["message"].lower()


async def test_expiry_is_computed_by_the_server(
    client: AsyncClient, organizer: Account, db: AsyncSession
) -> None:
    """The client picks a window; the server owns the deadline.

    An `expires_at` accepted from the body would be trivially forgeable — post
    food that never expires, or that outlives the feed.
    """
    before = datetime.now(UTC)
    body = await post_listing(
        client,
        organizer,
        expiry_minutes=15,
        expires_at="2099-01-01T00:00:00Z",  # ignored
    )

    expires_at = datetime.fromisoformat(body["expires_at"])
    assert before + timedelta(minutes=14) < expires_at < before + timedelta(minutes=16)


@pytest.mark.parametrize("minutes", [10, 25, 90, 0, -5])
async def test_expiry_must_be_a_window_the_spec_offers(
    client: AsyncClient, organizer: Account, minutes: int
) -> None:
    response = await client.post(
        "/listings", headers=organizer.headers, json=payload(expiry_minutes=minutes)
    )

    assert response.status_code == 422


async def test_photos_keep_their_order(
    client: AsyncClient, organizer: Account
) -> None:
    urls = [f"https://cdn.example.com/{n}.jpg" for n in range(3)]

    body = await post_listing(client, organizer, photo_urls=urls)

    assert body["photo_urls"] == urls


# ---------------------------------------------------------------------------
# The feed
# ---------------------------------------------------------------------------


async def test_feed_shows_active_food(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer)

    response = await client.get("/listings", headers=recipient.headers)

    assert response.status_code == 200
    assert response.json()["count"] == 1


async def test_feed_hides_expired_food_even_before_a_sweep_runs(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    db: AsyncSession,
) -> None:
    """The v1 bug: the feed read `status`, which a background job maintained.

    Anything that expired between sweeps still showed as available. Here the
    query filters on `expires_at` directly, so no job needs to have run.
    """
    body = await post_listing(client, organizer)

    listing = await db.get(Listing, body["id"])
    assert listing is not None
    listing.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    # status deliberately left as "active", as if no sweep had run
    await db.flush()

    response = await client.get("/listings", headers=recipient.headers)

    assert response.json()["count"] == 0


async def test_feed_hides_cancelled_food(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    body = await post_listing(client, organizer)
    await client.post(f"/listings/{body['id']}/cancel", headers=organizer.headers)

    response = await client.get("/listings", headers=recipient.headers)

    assert response.json()["count"] == 0


async def test_feed_hides_food_with_nothing_left(
    client: AsyncClient,
    organizer: Account,
    recipient: Account,
    db: AsyncSession,
) -> None:
    body = await post_listing(client, organizer)

    listing = await db.get(Listing, body["id"])
    assert listing is not None
    listing.quantity_remaining = 0
    await db.flush()

    response = await client.get("/listings", headers=recipient.headers)

    assert response.json()["count"] == 0


async def test_feed_puts_the_most_urgent_food_first(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """Ordered by expiry, not recency — what is about to be wasted matters most."""
    await post_listing(client, organizer, title="Expires last", expiry_minutes=60)
    await post_listing(client, organizer, title="Expires first", expiry_minutes=15)
    await post_listing(client, organizer, title="Expires second", expiry_minutes=30)

    response = await client.get("/listings", headers=recipient.headers)

    titles = [item["title"] for item in response.json()["items"]]
    assert titles == ["Expires first", "Expires second", "Expires last"]


async def test_dietary_filter_requires_every_tag(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer, title="Vegan only", dietary_tags=["vegan"])
    await post_listing(
        client, organizer, title="Both", dietary_tags=["vegan", "gluten-free"]
    )

    response = await client.get(
        "/listings",
        headers=recipient.headers,
        params=[("dietary", "vegan"), ("dietary", "gluten-free")],
    )

    titles = [item["title"] for item in response.json()["items"]]
    assert titles == ["Both"]


async def test_radius_filter_keeps_what_is_close(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer, title="Nearby")
    await post_listing(
        client,
        organizer,
        title="Downtown",
        location={"campus": "Downtown", "lat": DOWNTOWN[0], "lng": DOWNTOWN[1]},
    )

    response = await client.get(
        "/listings",
        headers=recipient.headers,
        params={
            "lat": MEMORIAL_UNION[0],
            "lng": MEMORIAL_UNION[1],
            "radius_miles": 1,
        },
    )

    titles = [item["title"] for item in response.json()["items"]]
    assert titles == ["Nearby"]


async def test_distance_is_reported_when_the_requester_shares_a_location(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The spec's 'distance from recipient' on the map and in the feed."""
    await post_listing(client, organizer)

    response = await client.get(
        "/listings",
        headers=recipient.headers,
        params={"lat": MEMORIAL_UNION[0], "lng": MEMORIAL_UNION[1]},
    )

    distance = response.json()["items"][0]["distance_miles"]
    assert distance is not None
    assert 0.1 < distance < 1.0


async def test_distance_is_absent_without_a_location(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer)

    response = await client.get("/listings", headers=recipient.headers)

    assert response.json()["items"][0]["distance_miles"] is None


async def test_radius_without_coordinates_is_rejected(
    client: AsyncClient, recipient: Account
) -> None:
    response = await client.get(
        "/listings", headers=recipient.headers, params={"radius_miles": 1}
    )

    assert response.status_code == 400


async def test_time_filter_keeps_only_what_goes_soon(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer, title="Soon", expiry_minutes=15)
    await post_listing(client, organizer, title="Later", expiry_minutes=60)

    response = await client.get(
        "/listings", headers=recipient.headers, params={"max_minutes": 20}
    )

    titles = [item["title"] for item in response.json()["items"]]
    assert titles == ["Soon"]


async def test_countdown_is_returned_for_the_client(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """Time remaining needs no realtime channel — the client counts down from
    this locally. Only quantity has to be pushed."""
    await post_listing(client, organizer, expiry_minutes=30)

    response = await client.get("/listings", headers=recipient.headers)

    remaining = response.json()["items"][0]["seconds_remaining"]
    assert 29 * 60 < remaining <= 30 * 60


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


async def test_detail_view(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    body = await post_listing(client, organizer)

    response = await client.get(f"/listings/{body['id']}", headers=recipient.headers)

    assert response.status_code == 200
    assert response.json()["id"] == body["id"]
    assert response.json()["allergens"].startswith("Contains gluten")


async def test_unknown_listing_is_a_404(
    client: AsyncClient, recipient: Account
) -> None:
    response = await client.get(
        "/listings/00000000-0000-4000-8000-000000000000",
        headers=recipient.headers,
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Editing
# ---------------------------------------------------------------------------


async def test_organizer_can_edit_their_post(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    response = await client.patch(
        f"/listings/{body['id']}",
        headers=organizer.headers,
        json={"title": "Leftover pizza and salad", "allergens": "Gluten, dairy."},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Leftover pizza and salad"
    assert response.json()["allergens"] == "Gluten, dairy."


async def test_someone_elses_post_cannot_be_edited(
    client: AsyncClient, organizer: Account, other_organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    response = await client.patch(
        f"/listings/{body['id']}",
        headers=other_organizer.headers,
        json={"title": "Hijacked"},
    )

    assert response.status_code == 403


async def test_moving_a_listing_updates_its_location(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    response = await client.patch(
        f"/listings/{body['id']}",
        headers=organizer.headers,
        json={
            "location": {
                "campus": "Tempe",
                "building": "Memorial Union",
                "room": "301",
                "placement_note": "Second floor lounge",
                "lat": MEMORIAL_UNION[0],
                "lng": MEMORIAL_UNION[1],
            }
        },
    )

    assert response.status_code == 200
    assert response.json()["building"] == "Memorial Union"
    assert response.json()["placement_note"] == "Second floor lounge"


async def test_marking_out_of_stock_removes_it_from_the_feed(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The spec's 'mark as Claimed or Out of Stock' — stops recipients walking
    over for food that has gone."""
    body = await post_listing(client, organizer)

    response = await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={"status": "claimed"}
    )
    assert response.status_code == 200

    feed = await client.get("/listings", headers=recipient.headers)
    assert feed.json()["count"] == 0


async def test_more_food_can_be_added_after_marking_out_of_stock(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)
    await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={"status": "claimed"}
    )

    response = await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={"status": "active"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"


async def test_resizing_preserves_portions_already_taken(
    client: AsyncClient, organizer: Account, db: AsyncSession
) -> None:
    body = await post_listing(client, organizer, quantity_total=15)

    listing = await db.get(Listing, body["id"])
    assert listing is not None
    listing.quantity_remaining = 10  # five spoken for
    await db.flush()

    response = await client.patch(
        f"/listings/{body['id']}",
        headers=organizer.headers,
        json={"quantity_total": 20},
    )

    assert response.status_code == 200
    assert response.json()["quantity_total"] == 20
    assert response.json()["quantity_remaining"] == 15  # 20 - 5 still claimed


async def test_cannot_shrink_below_what_is_already_claimed(
    client: AsyncClient, organizer: Account, db: AsyncSession
) -> None:
    body = await post_listing(client, organizer, quantity_total=15)

    listing = await db.get(Listing, body["id"])
    assert listing is not None
    listing.quantity_remaining = 5  # ten spoken for
    await db.flush()

    response = await client.patch(
        f"/listings/{body['id']}",
        headers=organizer.headers,
        json={"quantity_total": 3},
    )

    assert response.status_code == 409
    assert "already claimed" in response.json()["message"]


async def test_an_empty_update_is_rejected(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    response = await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={}
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Cancelling
# ---------------------------------------------------------------------------


async def test_cancelling_is_idempotent(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)

    first = await client.post(
        f"/listings/{body['id']}/cancel", headers=organizer.headers
    )
    second = await client.post(
        f"/listings/{body['id']}/cancel", headers=organizer.headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "cancelled"


async def test_a_cancelled_listing_cannot_be_revived(
    client: AsyncClient, organizer: Account
) -> None:
    body = await post_listing(client, organizer)
    await client.post(f"/listings/{body['id']}/cancel", headers=organizer.headers)

    response = await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={"title": "Back!"}
    )

    assert response.status_code == 409


async def test_an_expired_listing_cannot_be_edited(
    client: AsyncClient, organizer: Account, db: AsyncSession
) -> None:
    body = await post_listing(client, organizer)

    listing = await db.get(Listing, body["id"])
    assert listing is not None
    listing.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    response = await client.patch(
        f"/listings/{body['id']}", headers=organizer.headers, json={"title": "Nope"}
    )

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# The organizer's own view
# ---------------------------------------------------------------------------


async def test_organizers_see_their_own_posts_including_finished_ones(
    client: AsyncClient, organizer: Account, other_organizer: Account
) -> None:
    live = await post_listing(client, organizer, title="Still up")
    gone = await post_listing(client, organizer, title="Withdrawn")
    await client.post(f"/listings/{gone['id']}/cancel", headers=organizer.headers)
    await post_listing(client, other_organizer, title="Someone else's")

    response = await client.get("/listings/mine", headers=organizer.headers)

    titles = {item["title"] for item in response.json()["items"]}
    assert titles == {"Still up", "Withdrawn"}
    assert live["id"] != gone["id"]


async def test_recipients_have_no_posting_panel(
    client: AsyncClient, recipient: Account
) -> None:
    response = await client.get("/listings/mine", headers=recipient.headers)

    assert response.status_code == 403


async def test_listing_ids_are_not_guessable_sequence(
    client: AsyncClient, organizer: Account, db: AsyncSession
) -> None:
    """UUID primary keys — an incrementing id would let anyone enumerate every
    posting on campus."""
    first = await post_listing(client, organizer)
    second = await post_listing(client, organizer)

    assert first["id"] != second["id"]
    rows = (await db.scalars(select(Listing).limit(2))).all()
    assert all(row.status is ListingStatus.ACTIVE for row in rows)
