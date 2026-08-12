"""Switching account type after registration.

The two roles are the two halves of a handover, so the interesting cases here
are not the happy paths — they are the refusals. A host who walks away from
live posts leaves recipients arriving at a building where nobody can confirm a
pickup, because the pickup route is organizer-only.
"""

from httpx import AsyncClient

from tests.conftest import Account
from tests.test_listings import post_listing


async def switch(client: AsyncClient, who: Account, role: str):
    return await client.post("/users/me/role", headers=who.headers, json={"role": role})


async def role_of(client: AsyncClient, who: Account) -> str:
    body = (await client.get("/users/me", headers=who.headers)).json()
    return body["role"]


# ---------------------------------------------------------------------------
# The switch itself
# ---------------------------------------------------------------------------


async def test_host_with_nothing_pending_becomes_a_recipient(
    client: AsyncClient, organizer: Account
) -> None:
    r = await switch(client, organizer, "recipient")

    assert r.status_code == 200, r.text
    assert r.json()["role"] == "recipient"
    assert await role_of(client, organizer) == "recipient"


async def test_recipient_with_nothing_pending_becomes_a_host(
    client: AsyncClient, recipient: Account
) -> None:
    r = await switch(client, recipient, "organizer")

    assert r.status_code == 200, r.text
    assert r.json()["role"] == "organizer"


async def test_asking_for_the_role_you_already_have_is_a_no_op(
    client: AsyncClient, organizer: Account
) -> None:
    """Not an error. The client can fire this without checking first, and a
    double-tap on the switch must not 409 at somebody."""
    r = await switch(client, organizer, "organizer")

    assert r.status_code == 200, r.text
    assert r.json()["role"] == "organizer"


async def test_switching_actually_moves_the_authorisation_gate(
    client: AsyncClient, recipient: Account
) -> None:
    """The point of the whole feature: the role gate has to follow the switch,
    not just the profile response."""
    denied = await client.post("/listings", headers=recipient.headers, json={})
    assert denied.status_code == 403

    await switch(client, recipient, "organizer")

    # Now allowed through the role gate — a 201 means it got past it.
    allowed = await post_listing(client, recipient, title="Now I can post")
    assert allowed["status"] == "active"


# ---------------------------------------------------------------------------
# Refusals — a host still owes somebody
# ---------------------------------------------------------------------------


async def test_host_with_a_live_post_is_refused(
    client: AsyncClient, organizer: Account
) -> None:
    await post_listing(client, organizer, title="Still out there")

    r = await switch(client, organizer, "recipient")

    assert r.status_code == 409
    # Singular reads "cancel it", not "cancel them" — this message is an
    # instruction to a person, and the wrong pronoun there reads as unfinished.
    assert "1 post still live" in r.json()["message"]
    assert "cancel it before" in r.json()["message"]
    # The refusal has to be total: a partially applied switch is worse than none.
    assert await role_of(client, organizer) == "organizer"


async def test_host_is_refused_while_someone_is_walking_over(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """⚠️ THE CASE THAT MOTIVATED THE FEATURE'S DESIGN.

    Claiming every portion flips the listing to CLAIMED, which is NOT a "live"
    status — so a check based on listing status alone would wave this through
    and strand a person mid-walk. Pending claims are counted separately.
    """
    listing = await post_listing(client, organizer, quantity_total=1)
    claimed = await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )
    assert claimed.status_code == 201, claimed.text

    r = await switch(client, organizer, "recipient")

    assert r.status_code == 409
    assert "1 person waiting to collect" in r.json()["message"]
    assert await role_of(client, organizer) == "organizer"


async def test_a_draft_does_not_block_a_host(
    client: AsyncClient, organizer: Account
) -> None:
    """A draft is invisible to the feed and nobody is waiting on it, so it has
    no claim on the account."""
    await post_listing(client, organizer, publish="draft")

    r = await switch(client, organizer, "recipient")

    assert r.status_code == 200, r.text
    assert r.json()["role"] == "recipient"


# ---------------------------------------------------------------------------
# Refusals — a recipient still holds a portion
# ---------------------------------------------------------------------------


async def test_recipient_holding_a_claim_is_refused(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    listing = await post_listing(client, organizer)
    await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )

    r = await switch(client, recipient, "organizer")

    assert r.status_code == 409
    assert "1 portion reserved" in r.json()["message"]
    assert await role_of(client, recipient) == "recipient"


async def test_recipient_can_switch_once_the_claim_is_released(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The refusal has to be a state, not a sentence — releasing the claim has
    to actually unblock the switch."""
    listing = await post_listing(client, organizer)
    claim = (
        await client.post(
            "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
        )
    ).json()
    assert (await switch(client, recipient, "organizer")).status_code == 409

    cancelled = await client.post(
        f"/claims/{claim['id']}/cancel", headers=recipient.headers
    )
    assert cancelled.status_code == 200, cancelled.text

    r = await switch(client, recipient, "organizer")
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "organizer"


async def test_switching_needs_a_profile(client: AsyncClient) -> None:
    r = await client.post("/users/me/role", json={"role": "organizer"})
    assert r.status_code == 401
