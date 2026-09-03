"""Reporting listings and blocking people.

The App Store asks for both by name for any app carrying user-generated
content (Guideline 1.2). What is worth testing is not that the endpoints
answer, but that a block actually takes effect everywhere a blocked person
could otherwise reach you — the feed *and* the claim path, since a listing id
is guessable and a link is shareable.
"""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Block, Report
from tests.conftest import Account

WRIGLEY = (33.4225, -111.9330)


def listing_payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Leftover pizza",
        "description": "A dozen boxes from the robotics showcase.",
        "allergens": "Contains gluten and dairy.",
        "dietary_tags": ["vegetarian"],
        "quantity_total": 12,
        "expiry_minutes": 30,
        "publish": "now",
        "location": {
            "campus": "Tempe",
            "building": "Wrigley Hall",
            "room": "205",
            "lat": WRIGLEY[0],
            "lng": WRIGLEY[1],
        },
    }
    body.update(overrides)
    return body


async def post_listing(
    client: AsyncClient, host: Account, **overrides: Any
) -> dict[str, Any]:
    response = await client.post(
        "/listings", headers=host.headers, json=listing_payload(**overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def feed_titles(client: AsyncClient, who: Account) -> list[str]:
    response = await client.get("/listings", headers=who.headers)
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


async def test_report_records_the_complaint(
    client: AsyncClient, db: AsyncSession, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)

    response = await client.post(
        f"/listings/{listing['id']}/report",
        headers=recipient.headers,
        json={
            "reason": "unsafe_food",
            "detail": "Looks like it has been out for hours.",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["reason"] == "unsafe_food"

    report = await db.scalar(select(Report))
    assert report is not None
    assert report.reporter_id == recipient.id
    assert report.reported_user_id == organizer.id
    # Copied at report time: the listing expires within the hour, and the
    # queue has to still make sense afterwards.
    assert report.listing_title == "Leftover pizza"
    assert report.resolved_at is None


async def test_report_tells_the_reporter_nothing_about_the_outcome(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    # Confirming what happened to the listing or the account behind it would
    # make reporting a way to probe other people's accounts.
    listing = await post_listing(client, organizer)

    response = await client.post(
        f"/listings/{listing['id']}/report",
        headers=recipient.headers,
        json={"reason": "spam"},
    )

    assert set(response.json()) == {"id", "reason", "created_at"}


async def test_other_requires_words(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    # "Other" with no detail is a row nobody can act on.
    listing = await post_listing(client, organizer)

    response = await client.post(
        f"/listings/{listing['id']}/report",
        headers=recipient.headers,
        json={"reason": "other"},
    )

    assert response.status_code == 422, response.text


async def test_report_rejects_an_unknown_reason(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)

    response = await client.post(
        f"/listings/{listing['id']}/report",
        headers=recipient.headers,
        json={"reason": "i_just_dont_like_it"},
    )

    assert response.status_code == 422, response.text


async def test_reporting_a_vanished_listing_is_a_404(
    client: AsyncClient, recipient: Account
) -> None:
    missing = "00000000-0000-0000-0000-000000000000"

    response = await client.post(
        f"/listings/{missing}/report",
        headers=recipient.headers,
        json={"reason": "offensive"},
    )

    assert response.status_code == 404, response.text


async def test_the_same_thing_can_be_reported_twice(
    client: AsyncClient, db: AsyncSession, organizer: Account, recipient: Account
) -> None:
    # Two reports on one listing is a signal, not a mistake — and de-duping
    # would hide the fact that several people objected.
    listing = await post_listing(client, organizer)

    for _ in range(2):
        response = await client.post(
            f"/listings/{listing['id']}/report",
            headers=recipient.headers,
            json={"reason": "misleading"},
        )
        assert response.status_code == 201, response.text

    rows = (await db.execute(select(Report))).scalars().all()
    assert len(rows) == 2


# --------------------------------------------------------------------------
# Blocking
# --------------------------------------------------------------------------


async def test_block_hides_their_food_from_your_feed(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer)
    assert await feed_titles(client, recipient) == ["Leftover pizza"]

    response = await client.post(
        f"/users/{organizer.id}/block", headers=recipient.headers
    )
    assert response.status_code == 204, response.text

    assert await feed_titles(client, recipient) == []


async def test_block_works_in_both_directions(
    client: AsyncClient,
    organizer: Account,
    other_organizer: Account,
    recipient: Account,
) -> None:
    # A one-directional block would leave the person you blocked still able to
    # claim your food and turn up to collect it, which is the outcome blocking
    # exists to prevent. So the organizer blocks the recipient, and the
    # recipient stops seeing the organizer.
    await post_listing(client, organizer)
    await post_listing(client, other_organizer, title="Kosher deli platters")

    response = await client.post(
        f"/users/{recipient.id}/block", headers=organizer.headers
    )
    assert response.status_code == 204, response.text

    # Only the blocker's listing disappears; everyone else is unaffected.
    assert await feed_titles(client, recipient) == ["Kosher deli platters"]


async def test_a_blocked_recipient_cannot_claim_by_direct_id(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    # The feed hides it, but a listing id is guessable and a link is
    # shareable, so the refusal has to exist at the claim too.
    listing = await post_listing(client, organizer)
    await client.post(f"/users/{recipient.id}/block", headers=organizer.headers)

    response = await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )

    # Not-found rather than forbidden: a 403 would confirm the listing exists
    # and tell someone they have been blocked.
    assert response.status_code == 404, response.text


async def test_blocking_twice_is_a_no_op(
    client: AsyncClient, db: AsyncSession, organizer: Account, recipient: Account
) -> None:
    for _ in range(2):
        response = await client.post(
            f"/users/{organizer.id}/block", headers=recipient.headers
        )
        assert response.status_code == 204, response.text

    rows = (await db.execute(select(Block))).scalars().all()
    assert len(rows) == 1


async def test_you_cannot_block_yourself(
    client: AsyncClient, recipient: Account
) -> None:
    # It would filter your own listings out of your own feed, which reads as
    # the app having lost them.
    response = await client.post(
        f"/users/{recipient.id}/block", headers=recipient.headers
    )

    assert response.status_code == 400, response.text


async def test_blocking_an_unknown_account_is_a_404(
    client: AsyncClient, recipient: Account
) -> None:
    response = await client.post(
        "/users/nobody-with-this-uid/block", headers=recipient.headers
    )

    assert response.status_code == 404, response.text


async def test_unblocking_brings_the_food_back(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await post_listing(client, organizer)
    await client.post(f"/users/{organizer.id}/block", headers=recipient.headers)
    assert await feed_titles(client, recipient) == []

    response = await client.delete(
        f"/users/{organizer.id}/block", headers=recipient.headers
    )
    assert response.status_code == 204, response.text

    assert await feed_titles(client, recipient) == ["Leftover pizza"]


async def test_unblocking_someone_never_blocked_is_a_no_op(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    response = await client.delete(
        f"/users/{organizer.id}/block", headers=recipient.headers
    )

    assert response.status_code == 204, response.text


async def test_the_block_list_shows_who_you_blocked(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    await client.post(f"/users/{organizer.id}/block", headers=recipient.headers)

    response = await client.get("/users/me/blocks", headers=recipient.headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 1
    assert body["items"][0]["user_id"] == organizer.id


async def test_the_block_list_does_not_reveal_being_blocked(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    # A block is meant to be a quiet exit. Showing the other side would turn
    # it into a confrontation.
    await client.post(f"/users/{recipient.id}/block", headers=organizer.headers)

    response = await client.get("/users/me/blocks", headers=recipient.headers)

    assert response.json() == {"items": [], "count": 0}


@pytest.mark.parametrize("endpoint", ["/users/me/blocks"])
async def test_moderation_requires_authentication(
    client: AsyncClient, endpoint: str
) -> None:
    response = await client.get(endpoint)

    assert response.status_code == 401, response.text
