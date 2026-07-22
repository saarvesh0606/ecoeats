"""Profile registration and updates."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import User
from api.models.enums import UserRole
from tests.fake_auth import FakeTokenVerifier, bearer


async def test_registering_creates_a_profile(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue(email="sun.devil@asu.edu", name="Sun Devil")

    response = await client.post(
        "/users/me", headers=bearer(token), json={"role": "organizer"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "sun.devil@asu.edu"
    assert body["role"] == "organizer"
    assert body["name"] == "Sun Devil"


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


async def test_identity_comes_from_the_token_not_the_body(
    client: AsyncClient, auth: FakeTokenVerifier, db: AsyncSession
) -> None:
    """The v1 vulnerability, closed.

    v1 accepted the host's name and email from the request body, so a caller
    could post as somebody else. Here the body cannot influence identity at
    all: extra fields are ignored and email comes from the verified token.
    """
    token = auth.issue(uid="realuid123", email="real.person@asu.edu")

    response = await client.post(
        "/users/me",
        headers=bearer(token),
        json={
            "role": "organizer",
            "id": "someone-elses-uid",
            "email": "victim@asu.edu",
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == "realuid123"
    assert response.json()["email"] == "real.person@asu.edu"

    impersonated = await db.get(User, "someone-elses-uid")
    assert impersonated is None


async def test_name_falls_back_to_the_email_local_part(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Firebase email/password signups carry no display name."""
    token = auth.issue(email="mkumar17@asu.edu", name=None)

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
