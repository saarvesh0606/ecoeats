"""Revoking a Sign in with Apple authorisation.

Apple requires an app offering account deletion to withdraw the user's
authorisation too (Review Guideline 5.1.1(v)). Skipping it is not only a review
problem: Apple then stops re-prompting, so someone who deletes their account and
signs up again is silently given no name and no email. That is exactly how this
was found, on a real phone.

Nothing here reaches Apple. The client secret is signed with a throwaway key
generated in-process, and the HTTP side goes through httpx.MockTransport —
talking to Apple for real would need the production key and would revoke a real
person's session.
"""

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from api.config import Settings
from api.services.apple import (
    APPLE_AUDIENCE,
    AppleAuthError,
    AppleClient,
    build_apple_client,
)

TEAM_ID = "MGKDDUAMKW"
KEY_ID = "74BK655Z2K"
CLIENT_ID = "com.saarvesh.ecoeats"


@pytest.fixture(scope="module")
def private_key() -> str:
    """A real ES256 key, generated here — never the project's own."""
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture(scope="module")
def public_key(private_key: str):
    return serialization.load_pem_private_key(
        private_key.encode(), password=None
    ).public_key()


def client_with(private_key: str, handler) -> AppleClient:
    return AppleClient(
        team_id=TEAM_ID,
        key_id=KEY_ID,
        private_key=private_key,
        client_id=CLIENT_ID,
        transport=httpx.MockTransport(handler),
    )


def form_of(request: httpx.Request) -> dict[str, str]:
    return dict(httpx.QueryParams(request.content.decode()))


# --------------------------------------------------------------------------
# The client secret — a JWT we mint, not a static secret
# --------------------------------------------------------------------------


async def test_the_client_secret_is_a_jwt_apple_will_accept(
    private_key: str, public_key
) -> None:
    """Every field checked here is one Apple checks too, and a wrong one comes
    back as `invalid_client` with nothing to say which half is wrong."""
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(form_of(request))
        return httpx.Response(200, json={"refresh_token": "r1"})

    await client_with(private_key, handler).exchange_code("code-123")

    claims = jwt.decode(
        seen["client_secret"],
        public_key,
        algorithms=["ES256"],
        audience=APPLE_AUDIENCE,
    )
    assert claims["iss"] == TEAM_ID
    # sub is the BUNDLE id for a native sign-in, not a Services ID.
    assert claims["sub"] == CLIENT_ID
    assert claims["exp"] > claims["iat"]

    header = jwt.get_unverified_header(seen["client_secret"])
    assert header["kid"] == KEY_ID
    assert header["alg"] == "ES256"


# --------------------------------------------------------------------------
# Exchanging the one-shot code
# --------------------------------------------------------------------------


async def test_the_code_is_traded_for_a_refresh_token(private_key: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        form = form_of(request)
        assert form["grant_type"] == "authorization_code"
        assert form["code"] == "code-123"
        assert form["client_id"] == CLIENT_ID
        return httpx.Response(200, json={"refresh_token": "refresh-abc"})

    token = await client_with(private_key, handler).exchange_code("code-123")

    assert token == "refresh-abc"


async def test_a_refused_code_raises(private_key: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    with pytest.raises(AppleAuthError):
        await client_with(private_key, handler).exchange_code("stale")


async def test_a_response_without_a_token_raises(private_key: str) -> None:
    """200 is not the same as useful."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": "a"})

    with pytest.raises(AppleAuthError):
        await client_with(private_key, handler).exchange_code("code-123")


# --------------------------------------------------------------------------
# Revoking
# --------------------------------------------------------------------------


async def test_revoking_sends_the_refresh_token(private_key: str) -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(form_of(request))
        assert str(request.url).endswith("/auth/revoke")
        return httpx.Response(200, text="")  # Apple answers 200 and empty

    await client_with(private_key, handler).revoke("refresh-abc")

    assert seen["token"] == "refresh-abc"
    assert seen["token_type_hint"] == "refresh_token"


async def test_a_refused_revocation_raises(private_key: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_client"})

    with pytest.raises(AppleAuthError):
        await client_with(private_key, handler).revoke("refresh-abc")


# --------------------------------------------------------------------------
# Configuration — dormant is a supported state
# --------------------------------------------------------------------------


def test_without_credentials_there_is_no_client(settings: Settings) -> None:
    """Dev, tests and any deployment without the key run this way, and a
    deletion there skips revocation rather than failing."""
    assert build_apple_client(settings) is None


def test_a_partial_configuration_is_still_no_client(
    settings: Settings, private_key: str
) -> None:
    """Half-configured must not look configured — it would fail at the one
    moment it is needed, in the middle of somebody's account deletion."""
    half = settings.model_copy(
        update={
            "apple_team_id": TEAM_ID,
            "apple_private_key_inline": private_key,
        }  # no key id
    )

    assert build_apple_client(half) is None


def test_a_full_configuration_builds_one(
    settings: Settings, private_key: str
) -> None:
    full = settings.model_copy(
        update={
            "apple_team_id": TEAM_ID,
            "apple_key_id": KEY_ID,
            "apple_private_key_inline": private_key,
        }
    )

    assert build_apple_client(full) is not None


# --------------------------------------------------------------------------
# Deleting an account — the reason any of this exists
# --------------------------------------------------------------------------


class FakeApple:
    """Records what it was asked to do; can be told to fail."""

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.revoked: list[str] = []
        self.exchanged: list[str] = []

    async def exchange_code(self, code: str) -> str:
        self.exchanged.append(code)
        if self.fail:
            raise AppleAuthError("nope")
        return f"refresh-for-{code}"

    async def revoke(self, refresh_token: str) -> None:
        self.revoked.append(refresh_token)
        if self.fail:
            raise AppleAuthError("nope")


async def test_the_code_is_exchanged_and_kept(app, client, recipient) -> None:
    apple = FakeApple()
    app.state.apple = apple

    response = await client.post(
        "/users/me/apple-authorization",
        headers=recipient.headers,
        json={"authorization_code": "code-123"},
    )

    assert response.status_code == 204
    assert apple.exchanged == ["code-123"]


async def test_deleting_revokes_the_authorisation(
    app, client, recipient
) -> None:
    """Without this Apple never re-prompts, and the next signup silently gets
    no name and no email."""
    apple = FakeApple()
    app.state.apple = apple
    await client.post(
        "/users/me/apple-authorization",
        headers=recipient.headers,
        json={"authorization_code": "code-123"},
    )

    response = await client.delete("/users/me", headers=recipient.headers)

    assert response.status_code == 204
    assert apple.revoked == ["refresh-for-code-123"]


async def test_the_account_still_goes_when_apple_will_not_answer(
    app, client, recipient
) -> None:
    """Someone asking to be deleted must not be told it failed because a third
    party was unreachable. The row and the identity are what they asked to be
    rid of, and both still go."""
    working = FakeApple()
    app.state.apple = working
    await client.post(
        "/users/me/apple-authorization",
        headers=recipient.headers,
        json={"authorization_code": "code-123"},
    )
    app.state.apple = FakeApple(fail=True)

    response = await client.delete("/users/me", headers=recipient.headers)

    assert response.status_code == 204
    # 401 rather than 404: the identity went with the row, so the token no
    # longer verifies at all. That is a stronger statement than "no profile" —
    # the deletion completed both halves despite Apple refusing.
    after = await client.get("/users/me", headers=recipient.headers)
    assert after.status_code == 401


async def test_an_account_that_never_used_apple_needs_no_revocation(
    app, client, recipient
) -> None:
    apple = FakeApple()
    app.state.apple = apple

    response = await client.delete("/users/me", headers=recipient.headers)

    assert response.status_code == 204
    assert apple.revoked == []


async def test_without_a_configured_client_deletion_is_unchanged(
    app, client, recipient
) -> None:
    """The state every deployment without the key runs in, including today's."""
    app.state.apple = None

    response = await client.delete("/users/me", headers=recipient.headers)

    assert response.status_code == 204
