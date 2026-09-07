"""Profile registration and updates."""

import asyncio

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.legal import CURRENT_TERMS_VERSION
from api.models import User
from api.models.enums import UserRole
from tests.conftest import Account, register_account
from tests.fake_auth import FakeTokenVerifier, bearer
from tests.test_listings import post_listing


async def test_a_changed_provider_address_is_followed(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """The row was written once and never revisited.

    The case that surfaced it: Apple's "Hide My Email" issues a relay address,
    and a user who later switches to sharing their real one kept the relay
    address for good.
    """
    token = auth.issue(
        uid="apple-uid", email="x7k2m9p4qr@privaterelay.appleid.com"
    )
    await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    # Same identity, address now shared rather than hidden.
    moved = auth.issue(uid="apple-uid", email="sam.rivera@gmail.com")
    response = await client.get("/users/me", headers=bearer(moved))

    assert response.status_code == 200
    assert response.json()["email"] == "sam.rivera@gmail.com"


async def test_an_address_already_taken_is_not_stolen(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Two accounts cannot hold one address, and the request must not fail.

    Somebody signing up by another route may already hold the address this
    token now claims. That is a real state, not an error to raise at whoever
    happens to be making the request — they keep what they have.
    """
    other = auth.issue(uid="other-uid", email="taken@gmail.com")
    await client.post(
        "/users/me", headers=bearer(other), json={"role": "recipient"}
    )

    mine = auth.issue(uid="my-uid", email="mine@gmail.com")
    await client.post(
        "/users/me", headers=bearer(mine), json={"role": "recipient"}
    )

    collided = auth.issue(uid="my-uid", email="taken@gmail.com")
    response = await client.get("/users/me", headers=bearer(collided))

    assert response.status_code == 200  # served, not 500
    assert response.json()["email"] == "mine@gmail.com"  # unchanged


async def test_a_private_relay_address_does_not_become_the_name(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Sign in with Apple's "Hide My Email" issues a random local part.

    The old fallback split the address and used it, so a returning Apple user —
    Apple sends a name on the FIRST authorisation only — got a display name of
    random letters. Found on a real device.
    """
    token = auth.issue(email="x7k2m9p4qr@privaterelay.appleid.com", name=None)

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    assert response.status_code == 201
    assert response.json()["name"] == "New member"
    assert "x7k2m9p4qr" not in response.json()["name"]


async def test_an_ordinary_address_still_seeds_the_name(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """The local part of a real mailbox is a fair guess and stays in use."""
    token = auth.issue(email="mkumar17@gmail.com", name=None)

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    assert response.json()["name"] == "mkumar17"


async def test_a_name_from_the_client_beats_every_fallback(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """What the role screen asked for wins — that is the point of asking."""
    token = auth.issue(email="x7k2m9p4qr@privaterelay.appleid.com", name=None)

    response = await client.post(
        "/users/me",
        headers=bearer(token),
        json={"role": "recipient", "name": "Sam Rivera"},
    )

    assert response.json()["name"] == "Sam Rivera"


async def test_registering_creates_a_profile(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue(email="sam.rivera@gmail.com", name="Sam Rivera")

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "organizer"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "sam.rivera@gmail.com"
    assert body["role"] == "organizer"
    assert body["name"] == "Sam Rivera"


async def test_registered_profile_is_then_readable(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue()
    await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["role"] == "recipient"


async def test_registering_twice_is_a_conflict(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue()
    await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "organizer"}
    )

    assert response.status_code == 409


async def test_registering_an_address_someone_else_holds_is_a_conflict(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """The 500 of 2026-09-07.

    Registration only ever checked the uid, but the address is unique too. A
    row holding it under a different uid — what a deleted sign-in identity
    leaves behind — sailed past that check and broke the constraint on INSERT,
    and the unhandled IntegrityError became "Internal server error". The
    address then looked permanently unusable and nothing said why.
    """
    first = auth.issue(uid="first-uid", email="sam.rivera@gmail.com")
    await client.post(
        "/users/me", headers=bearer(first), json={"role": "recipient"}
    )

    # Same person, same address, a new sign-in identity behind it.
    again = auth.issue(uid="second-uid", email="sam.rivera@gmail.com")
    response = await client.post(
        "/users/me", headers=bearer(again), json={"role": "recipient"}
    )

    assert response.status_code == 409, response.text
    # Actionable, not "Internal server error" — the way out is to sign in.
    assert "sign in" in response.json()["message"].lower()


async def test_an_address_stranded_by_a_deleted_identity_is_reclaimed(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """Deleting an account in the Firebase console reads like a clean reset
    and is the opposite: the login goes, the profile row stays holding the
    address, and every retry mints a new uid that collides with it forever.

    Nobody can sign in as that row again, and the caller has proved they
    control the mailbox, so registration takes the address back.
    """
    stranded = auth.issue(uid="old-uid", email="sam.rivera@gmail.com")
    await client.post(
        "/users/me", headers=bearer(stranded), json={"role": "recipient"}
    )
    auth.delete("old-uid")  # what the Firebase console does, and only that

    returning = auth.issue(uid="new-uid", email="sam.rivera@gmail.com")
    response = await client.post(
        "/users/me", headers=bearer(returning), json={"role": "organizer"}
    )

    assert response.status_code == 201, response.text
    assert response.json()["role"] == "organizer"  # a fresh start, not the old row

    # The stranded row is gone rather than merely bypassed — one account holds
    # the address, which is what the unique constraint says too.
    rows = await db.scalars(
        select(User).where(User.email == "sam.rivera@gmail.com")
    )
    assert [u.id for u in rows] == ["new-uid"]


async def test_a_stranded_account_with_food_history_is_never_reclaimed(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """The limit on reclaiming, and the reason for it.

    Addresses get reassigned — university ones especially — so a verified
    token is proof of today's mailbox, not proof of being the person who used
    it last year. Handing someone a stranger's listings and claims would be
    worse than the lockout. This one goes to a human.
    """
    host = await register_account(client, auth, "organizer", "Wrigley Hall")
    await post_listing(client, host)
    auth.delete(host.id)

    returning = auth.issue(uid="brand-new-uid", email=host.email)
    response = await client.post(
        "/users/me", headers=bearer(returning), json={"role": "recipient"}
    )

    assert response.status_code == 409, response.text
    assert "hello@ecoeatsapp.com" in response.json()["message"]
    assert await db.get(User, host.id) is not None  # untouched


async def test_an_unreachable_firebase_refuses_rather_than_deleting(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """"Don't know" is not "gone".

    Reclaiming deletes a profile row, so it may only ever act on a definite
    answer. If Firebase cannot be reached the registration is refused — the
    cost is one person waiting, against deleting a live account.
    """
    holder = auth.issue(uid="live-uid", email="sam.rivera@gmail.com")
    await client.post(
        "/users/me", headers=bearer(holder), json={"role": "recipient"}
    )
    auth.unreachable.add("live-uid")

    other = auth.issue(uid="another-uid", email="sam.rivera@gmail.com")
    response = await client.post(
        "/users/me", headers=bearer(other), json={"role": "recipient"}
    )

    assert response.status_code == 409, response.text
    assert await db.get(User, "live-uid") is not None  # not deleted on a guess


async def test_two_registrations_of_one_address_race_cleanly(
    live_client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Real connections, so the pre-check can lose its race and the constraint
    is left to arbitrate. Either way one wins and the loser gets a 409 — never
    the 500 the unhandled IntegrityError produced.
    """
    tokens = [
        auth.issue(uid="race-uid-1", email="one.address@gmail.com"),
        auth.issue(uid="race-uid-2", email="one.address@gmail.com"),
    ]

    responses = await asyncio.gather(
        *(
            live_client.post(
                "/users/me", headers=bearer(token), json={"role": "recipient"}
            )
            for token in tokens
        )
    )

    statuses = sorted(r.status_code for r in responses)
    assert statuses == [201, 409], [r.text for r in responses]


async def test_identity_comes_from_the_token_not_the_body(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """The v1 vulnerability, closed.

    v1 accepted the host's name and email from the request body, so a caller
    could post as somebody else. Here the body cannot influence identity at
    all: extra fields are ignored and email comes from the verified token.
    """
    token = auth.issue(uid="realuid123", email="real.person@gmail.com")

    response = await client.post(
        "/users/me",
        headers=bearer(token),
        json={
            "role": "organizer",
            "id": "someone-elses-uid",
            "email": "victim@gmail.com",
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == "realuid123"
    assert response.json()["email"] == "real.person@gmail.com"

    impersonated = await db.get(User, "someone-elses-uid")
    assert impersonated is None


async def test_name_falls_back_to_the_email_local_part(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Firebase email/password signups carry no display name."""
    token = auth.issue(email="mkumar17@gmail.com", name=None)

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    assert response.json()["name"] == "mkumar17"


async def test_profile_updates_apply(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue()
    await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    response = await client.patch(
        "/users/me",
        headers=bearer(token),
        json={"name": "Updated Name", "dietary_prefs": ["vegetarian", "halal"]},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    assert response.json()["dietary_prefs"] == ["vegetarian", "halal"]


async def test_role_cannot_be_changed_by_update(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """Role is a permanent account type, not a preference. It is absent from
    the update schema, so a body carrying it changes nothing."""
    token = auth.issue(uid="fixedrole123")
    await client.post(
        "/users/me", headers=bearer(token), json={"role": "recipient"}
    )

    response = await client.patch(
        "/users/me", headers=bearer(token), json={"role": "organizer"}
    )

    assert response.status_code == 200
    assert response.json()["role"] == "recipient"

    user = await db.get(User, "fixedrole123")
    assert user is not None
    assert user.role is UserRole.RECIPIENT


async def test_an_unknown_role_is_rejected(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue()

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "administrator"}
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Terms acceptance
# ---------------------------------------------------------------------------


async def test_a_new_account_has_accepted_nothing(
    client: AsyncClient, organizer: Account
) -> None:
    # The client gates on terms_current, so a fresh account must report false —
    # otherwise nobody is ever shown the terms at all.
    body = (await client.get("/users/me", headers=organizer.headers)).json()

    assert body["terms_current"] is False
    assert body["terms_accepted_at"] is None
    assert body["terms_version"] is None


async def test_accepting_records_the_version_in_force(
    client: AsyncClient, organizer: Account
) -> None:
    response = await client.post("/users/me/terms", headers=organizer.headers)

    assert response.status_code == 200
    body = response.json()
    assert body["terms_current"] is True
    assert body["terms_version"] == CURRENT_TERMS_VERSION
    assert body["terms_accepted_at"] is not None

    # And it survives a reload, rather than living only in that response.
    again = (await client.get("/users/me", headers=organizer.headers)).json()
    assert again["terms_current"] is True


async def test_the_client_cannot_choose_which_version_it_accepted(
    client: AsyncClient, organizer: Account
) -> None:
    # The whole point of the record is that it names a document the user was
    # actually shown. A body-supplied version would let a caller claim to have
    # accepted something that never appeared on screen.
    response = await client.post(
        "/users/me/terms",
        headers=organizer.headers,
        json={"terms_version": "1999-01-01"},
    )

    assert response.status_code == 200
    assert response.json()["terms_version"] == CURRENT_TERMS_VERSION


async def test_accepting_twice_is_not_an_error(
    client: AsyncClient, organizer: Account
) -> None:
    first = (await client.post("/users/me/terms", headers=organizer.headers)).json()
    second = (await client.post("/users/me/terms", headers=organizer.headers)).json()

    assert second["terms_current"] is True
    assert second["terms_accepted_at"] >= first["terms_accepted_at"]


async def test_switching_role_asks_again_the_first_time(
    client: AsyncClient, recipient: Account
) -> None:
    """A host and a recipient agree to different obligations.

    One is giving food away, the other is collecting and eating it, so somebody
    who agreed as a recipient has not yet agreed as a host.
    """
    await client.post("/users/me/terms", headers=recipient.headers)
    assert (
        await client.get("/users/me", headers=recipient.headers)
    ).json()["terms_current"] is True

    await client.post(
        "/users/me/role", headers=recipient.headers, json={"role": "organizer"}
    )

    after = (await client.get("/users/me", headers=recipient.headers)).json()
    assert after["role"] == "organizer"
    assert after["terms_current"] is False


async def test_switching_back_does_not_ask_twice(
    client: AsyncClient, recipient: Account
) -> None:
    # Agreeing as each role once is enough; flipping between them afterwards is
    # not a new agreement.
    await client.post("/users/me/terms", headers=recipient.headers)
    await client.post(
        "/users/me/role", headers=recipient.headers, json={"role": "organizer"}
    )
    await client.post("/users/me/terms", headers=recipient.headers)

    await client.post(
        "/users/me/role", headers=recipient.headers, json={"role": "recipient"}
    )

    back = (await client.get("/users/me", headers=recipient.headers)).json()
    assert back["terms_current"] is True
    assert sorted(back["terms_accepted_roles"]) == ["organizer", "recipient"]


async def test_new_terms_clear_every_role(
    client: AsyncClient, recipient: Account, monkeypatch
) -> None:
    # Accepting a new version as one role must not let a stale entry from the
    # old version stand in for agreement to the new document.
    await client.post("/users/me/terms", headers=recipient.headers)
    await client.post(
        "/users/me/role", headers=recipient.headers, json={"role": "organizer"}
    )
    await client.post("/users/me/terms", headers=recipient.headers)

    monkeypatch.setattr("api.routers.users.CURRENT_TERMS_VERSION", "2099-01-01")
    monkeypatch.setattr("api.schemas.user.CURRENT_TERMS_VERSION", "2099-01-01")

    after = (await client.post("/users/me/terms", headers=recipient.headers)).json()

    assert after["terms_accepted_roles"] == ["organizer"]
    assert after["terms_current"] is True


async def test_terms_acceptance_needs_an_account(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    # Signed in but unregistered: there is no row to record acceptance against.
    token = auth.issue()

    response = await client.post("/users/me/terms", headers=bearer(token))

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Deleting an account
# ---------------------------------------------------------------------------


async def test_deleting_an_account_removes_the_profile(
    client: AsyncClient, db: AsyncSession, recipient: Account
) -> None:
    response = await client.delete("/users/me", headers=recipient.headers)

    assert response.status_code == 204
    assert await db.get(User, recipient.id) is None


async def test_deleting_an_account_removes_the_identity_too(
    client: AsyncClient, auth: FakeTokenVerifier, recipient: Account
) -> None:
    # Without this the account can sign straight back in and land on role
    # selection as if brand new — with the same address that was meant to be
    # gone. The fake forgets its tokens, so this proves the door is shut.
    await client.delete("/users/me", headers=recipient.headers)

    assert recipient.id in auth.deleted
    after = await client.get("/users/me", headers=recipient.headers)
    assert after.status_code == 401


async def test_deleting_a_host_takes_their_listings(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """A host's posts go with them — including claims made on that food.

    That is the correct reading of "delete my account": leaving posts up that
    nobody can confirm a pickup for would be worse. Worth knowing before
    somebody deletes an account mid-service.
    """
    listing = await post_listing(client, organizer)
    await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )

    await client.delete("/users/me", headers=organizer.headers)

    gone = await client.get(f"/listings/{listing['id']}", headers=recipient.headers)
    assert gone.status_code == 404

    # The recipient still exists; only the food went.
    still_here = await client.get("/users/me", headers=recipient.headers)
    assert still_here.status_code == 200


async def test_deleting_needs_an_account(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue()

    response = await client.delete("/users/me", headers=bearer(token))

    assert response.status_code == 404
