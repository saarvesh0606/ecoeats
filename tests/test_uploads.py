"""Signed upload authorisation.

The signature algorithm is tested against a hand-computed reference so a change
to it cannot pass silently, and the endpoint is tested for the one rule that
matters: only organizers may upload.
"""

import hashlib

from httpx import AsyncClient

from api.services.uploads import (
    UPLOAD_FOLDER,
    build_upload_ticket,
    sign_params,
)
from tests.conftest import Account


def test_signature_matches_cloudinarys_algorithm() -> None:
    """Independent reimplementation of the documented algorithm.

    sorted params joined as k=v&k=v, secret appended, SHA-1 hex.
    """
    params = {"timestamp": 1700000000, "folder": "ecoeats/listings"}
    secret = "abc123"

    expected = hashlib.sha1(
        f"folder=ecoeats/listings&timestamp=1700000000{secret}".encode()
    ).hexdigest()

    assert sign_params(params, api_secret=secret) == expected


def test_signature_is_order_independent() -> None:
    """Params are sorted before signing, so insertion order cannot change it."""
    secret = "s"
    a = sign_params({"timestamp": 1, "folder": "x"}, api_secret=secret)
    b = sign_params({"folder": "x", "timestamp": 1}, api_secret=secret)
    assert a == b


def test_a_different_secret_produces_a_different_signature() -> None:
    params = {"timestamp": 1700000000, "folder": UPLOAD_FOLDER}
    assert sign_params(params, api_secret="one") != sign_params(
        params, api_secret="two"
    )


def test_ticket_carries_everything_the_client_needs() -> None:
    ticket = build_upload_ticket(
        cloud_name="demo",
        api_key="key123",
        api_secret="secret",
        now=1700000000,
    )

    assert ticket.timestamp == 1700000000
    assert ticket.folder == UPLOAD_FOLDER
    assert ticket.upload_url == "https://api.cloudinary.com/v1_1/demo/image/upload"
    # The signature must verify against the exact params the client will send.
    assert ticket.signature == sign_params(
        {"timestamp": ticket.timestamp, "folder": ticket.folder},
        api_secret="secret",
    )


# ---------------------------------------------------------------------------
# The endpoint
# ---------------------------------------------------------------------------


async def test_organizer_gets_an_upload_ticket(
    client: AsyncClient, organizer: Account
) -> None:
    response = await client.post("/uploads/signature", headers=organizer.headers)

    assert response.status_code == 200
    body = response.json()
    assert body["cloud_name"] == "test-cloud"
    assert body["api_key"] == "000000000000000"
    assert body["folder"] == UPLOAD_FOLDER
    assert body["signature"]
    assert body["upload_url"].endswith("/test-cloud/image/upload")

    # The returned signature must be valid for the returned params, or the
    # client's upload to Cloudinary would be rejected.
    assert body["signature"] == sign_params(
        {"timestamp": body["timestamp"], "folder": body["folder"]},
        api_secret="test-secret-do-not-use",
    )


async def test_recipients_cannot_get_an_upload_ticket(
    client: AsyncClient, recipient: Account
) -> None:
    """Recipients claim food; they do not post it, so they do not upload."""
    response = await client.post("/uploads/signature", headers=recipient.headers)

    assert response.status_code == 403


async def test_anonymous_uploads_are_refused(client: AsyncClient) -> None:
    response = await client.post("/uploads/signature")

    assert response.status_code == 401


async def test_the_secret_never_appears_in_the_response(
    client: AsyncClient, organizer: Account
) -> None:
    """The signature is derived from the secret but must not leak it."""
    response = await client.post("/uploads/signature", headers=organizer.headers)

    assert "test-secret-do-not-use" not in response.text
