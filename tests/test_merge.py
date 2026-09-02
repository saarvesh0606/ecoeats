"""Folding one person's two accounts into one.

Apple's "Hide My Email" gives a relay address that cannot be matched to
someone's real one, so one person signing in two ways becomes two accounts and
nothing on our side can tell. Linking stops new pairs forming; merging is the
cleanup for a pair that already exist.

It is the only irreversible thing in the app besides deletion, so what is
pinned here is not just "the rows moved" but the two ways it could go wrong
quietly: a collision silently dropping the wrong row, and a claim on your own
food surviving the merge.
"""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Claim, SavedListing, User
from api.models.enums import UserRole
from tests.factories import make_claim, make_listing, make_user
from tests.fake_auth import FakeTokenVerifier, bearer


async def test_listings_and_claims_move_to_the_surviving_account(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    keep = auth.issue(uid="keep-uid", email="keep@gmail.com")
    absorb = auth.issue(
        uid="absorb-uid", email="x7k@privaterelay.appleid.com"
    )
    await client.post(
        "/users/me", headers=bearer(keep), json={"role": "recipient"}
    )
    await client.post(
        "/users/me", headers=bearer(absorb), json={"role": "organizer"}
    )

    response = await client.post(
        "/users/me/merge", headers=bearer(keep), json={"token": absorb}
    )

    assert response.status_code == 200
    # The absorbed row is gone, not merely emptied.
    assert await db.get(User, "absorb-uid") is None


async def test_the_absorbed_account_cannot_sign_in_afterwards(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    keep = auth.issue(uid="keep-uid", email="keep@gmail.com")
    absorb = auth.issue(uid="absorb-uid", email="other@gmail.com")
    await client.post(
        "/users/me", headers=bearer(keep), json={"role": "recipient"}
    )
    await client.post(
        "/users/me", headers=bearer(absorb), json={"role": "recipient"}
    )

    await client.post(
        "/users/me/merge", headers=bearer(keep), json={"token": absorb}
    )

    # The identity went too — a merge that left it able to sign in would just
    # recreate the duplicate on the next launch.
    assert "absorb-uid" in auth.deleted


async def test_merging_yourself_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    me = auth.issue(uid="me-uid", email="me@gmail.com")
    await client.post(
        "/users/me", headers=bearer(me), json={"role": "recipient"}
    )

    response = await client.post(
        "/users/me/merge", headers=bearer(me), json={"token": me}
    )

    assert response.status_code == 400


async def test_an_account_with_no_profile_is_a_link_not_a_merge(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Reporting an empty success would leave them thinking it worked."""
    keep = auth.issue(uid="keep-uid", email="keep@gmail.com")
    fresh = auth.issue(uid="fresh-uid", email="fresh@gmail.com")
    await client.post(
        "/users/me", headers=bearer(keep), json={"role": "recipient"}
    )

    response = await client.post(
        "/users/me/merge", headers=bearer(keep), json={"token": fresh}
    )

    assert response.status_code == 404
    assert "Link it from Settings" in response.json()["message"]


async def test_a_bad_token_for_the_other_account_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Holding a valid token is the whole proof that they control it."""
    keep = auth.issue(uid="keep-uid", email="keep@gmail.com")
    await client.post(
        "/users/me", headers=bearer(keep), json={"role": "recipient"}
    )

    response = await client.post(
        "/users/me/merge",
        headers=bearer(keep),
        json={"token": "not-a-real-token"},
    )

    assert response.status_code == 401


# --------------------------------------------------------------------------
# The two collisions, which are the same person having done a thing twice
# --------------------------------------------------------------------------


async def test_a_listing_saved_by_both_is_kept_once(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    keep = auth.issue(uid="keep-uid", email="keep@gmail.com")
    absorb = auth.issue(uid="absorb-uid", email="other@gmail.com")
    for token in (keep, absorb):
        await client.post(
            "/users/me", headers=bearer(token), json={"role": "recipient"}
        )

    host = make_user(role=UserRole.ORGANIZER)
    db.add(host)
    await db.flush()
    listing = make_listing(organizer=host)
    db.add(listing)
    await db.flush()

    db.add(SavedListing(user_id="keep-uid", listing_id=listing.id))
    db.add(SavedListing(user_id="absorb-uid", listing_id=listing.id))
    await db.flush()

    response = await client.post(
        "/users/me/merge", headers=bearer(keep), json={"token": absorb}
    )

    assert response.status_code == 200
    body = response.json()
    # The duplicate did not move, and was reported rather than vanishing.
    assert body["saved"] == 0
    assert any("already-saved" in s for s in body["skipped"])

    rows = (
        await db.scalars(
            select(SavedListing).where(SavedListing.listing_id == listing.id)
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].user_id == "keep-uid"


async def test_a_claim_on_your_own_listing_does_not_survive(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """Only reachable through a merge: one account hosted it, the other claimed
    it, and they have just become the same person. Left alone it would tell
    them somebody is coming to collect, and that somebody is them."""
    keep = auth.issue(uid="host-uid", email="host@gmail.com")
    absorb = auth.issue(uid="absorb-uid", email="other@gmail.com")
    await client.post(
        "/users/me", headers=bearer(keep), json={"role": "organizer"}
    )
    await client.post(
        "/users/me", headers=bearer(absorb), json={"role": "recipient"}
    )

    host = await db.get(User, "host-uid")
    claimer = await db.get(User, "absorb-uid")
    assert host is not None and claimer is not None
    listing = make_listing(organizer=host)
    db.add(listing)
    await db.flush()
    db.add(make_claim(listing=listing, recipient=claimer))
    await db.flush()

    response = await client.post(
        "/users/me/merge", headers=bearer(keep), json={"token": absorb}
    )

    assert response.status_code == 200
    assert response.json()["self_claims_removed"] == 1

    left = (
        await db.scalars(
            select(Claim).where(Claim.listing_id == listing.id)
        )
    ).all()
    assert left == []
