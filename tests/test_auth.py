"""The gate every authenticated route sits behind.

Two rules decide whether a token becomes an identity: the address must be
verified, and it must be ASU. Both are enforced in one dependency so no route
can forget them — these tests are what hold that line.
"""

from httpx import AsyncClient

from tests.fake_auth import FakeTokenVerifier, bearer


async def test_no_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/users/me")

    assert response.status_code == 401
    assert response.json() == {"message": "Sign in to continue"}


async def test_unrecognised_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/users/me", headers=bearer("not-a-real-token"))

    assert response.status_code == 401


async def test_malformed_authorization_header_is_rejected(
    client: AsyncClient,
) -> None:
    response = await client.get(
        "/users/me", headers={"Authorization": "Basic abc123"}
    )

    assert response.status_code == 401


async def test_unverified_email_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Anyone can type someone else's address at signup. Until Firebase
    confirms the click, the token proves nothing about who is holding it."""
    token = auth.issue(email="sun@asu.edu", email_verified=False)

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 403
    assert "Confirm your email" in response.json()["message"]


async def test_non_asu_address_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    token = auth.issue(email="someone@gmail.com")

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 403
    assert "asu.edu" in response.json()["message"]


async def test_lookalike_domain_is_refused(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """A suffix check must not be fooled by a domain that merely contains ours."""
    token = auth.issue(email="attacker@asu.edu.evil.com")

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 403


async def test_valid_token_without_a_profile_returns_404(
    client: AsyncClient, auth: FakeTokenVerifier
) -> None:
    """Not an error — the signal for the client to show role selection, since
    a role cannot be read from a token."""
    token = auth.issue()

    response = await client.get("/users/me", headers=bearer(token))

    assert response.status_code == 404
