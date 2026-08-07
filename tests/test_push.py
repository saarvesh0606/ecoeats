"""Device registration, and delivery through Expo's push service.

Nothing here reaches the network: the sender is driven directly with a stubbed
HTTP client. The general suite has push switched off entirely (see conftest),
so a stray background task can never escape either.
"""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import DeviceToken
from api.services import push
from tests.conftest import Account

TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
OTHER_TOKEN = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"


# --- a stand-in for Expo -------------------------------------------------


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    """Records what would have been sent, and replies with canned receipts."""

    def __init__(self, receipts: list[dict[str, Any]] | None = None, **_: Any):
        self.sent: list[list[dict[str, Any]]] = []
        self._receipts = receipts

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, json: list[dict[str, Any]]) -> _FakeResponse:
        self.sent.append(json)
        receipts = self._receipts or [{"status": "ok"} for _ in json]
        return _FakeResponse({"data": receipts})


def _patch_client(monkeypatch: pytest.MonkeyPatch, client: _FakeClient) -> None:
    monkeypatch.setattr(push.httpx, "AsyncClient", lambda **_: client)


# --- registration --------------------------------------------------------


async def test_registering_a_device_is_idempotent(
    client: AsyncClient, recipient: Account, db: AsyncSession
) -> None:
    """The app re-registers on every launch; that must not pile up rows."""
    for _ in range(3):
        response = await client.post(
            "/devices",
            headers=recipient.headers,
            json={"token": TOKEN, "platform": "ios"},
        )
        assert response.status_code == 200

    rows = (
        await db.scalars(select(DeviceToken).where(DeviceToken.token == TOKEN))
    ).all()
    assert len(rows) == 1


async def test_a_token_moves_to_whoever_registered_it_last(
    client: AsyncClient,
    recipient: Account,
    organizer: Account,
    db: AsyncSession,
) -> None:
    """A reinstall or a handed-on phone re-registers a token under a new
    account. The old owner has to lose it, or they keep pushing to a device
    that is not theirs any more."""
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )
    await client.post(
        "/devices", headers=organizer.headers, json={"token": TOKEN}
    )

    row = await db.scalar(
        select(DeviceToken).where(DeviceToken.token == TOKEN)
    )
    assert row is not None
    assert row.user_id == organizer.id

    still_recipients = (
        await db.scalars(
            select(DeviceToken).where(DeviceToken.user_id == recipient.id)
        )
    ).all()
    assert still_recipients == []


async def test_a_device_can_be_unregistered(
    client: AsyncClient, recipient: Account, db: AsyncSession
) -> None:
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )

    response = await client.request(
        "DELETE",
        "/devices",
        headers=recipient.headers,
        json={"token": TOKEN},
    )
    assert response.status_code == 204

    assert (
        await db.scalar(select(DeviceToken).where(DeviceToken.token == TOKEN))
        is None
    )


async def test_signing_out_cannot_silence_someone_elses_phone(
    client: AsyncClient,
    recipient: Account,
    organizer: Account,
    db: AsyncSession,
) -> None:
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )

    await client.request(
        "DELETE", "/devices", headers=organizer.headers, json={"token": TOKEN}
    )

    assert (
        await db.scalar(select(DeviceToken).where(DeviceToken.token == TOKEN))
        is not None
    )


async def test_registering_needs_authentication(client: AsyncClient) -> None:
    response = await client.post("/devices", json={"token": TOKEN})
    assert response.status_code == 401


# --- delivery ------------------------------------------------------------


async def test_sends_one_message_per_registered_device(
    client: AsyncClient,
    recipient: Account,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for token in (TOKEN, OTHER_TOKEN):
        await client.post(
            "/devices", headers=recipient.headers, json={"token": token}
        )

    fake = _FakeClient()
    _patch_client(monkeypatch, fake)

    sent = await push.send_to_user(
        db, recipient.id, "Someone claimed your pizza", listing_id="abc"
    )

    assert sent == 2
    payloads = fake.sent[0]
    assert {p["to"] for p in payloads} == {TOKEN, OTHER_TOKEN}
    assert payloads[0]["body"] == "Someone claimed your pizza"
    # The data payload is the only reason a tap can open the right listing.
    assert payloads[0]["data"] == {"listingId": "abc"}


async def test_says_nothing_when_the_user_has_no_devices(
    db: AsyncSession, recipient: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _FakeClient()
    _patch_client(monkeypatch, fake)

    sent = await push.send_to_user(db, recipient.id, "hello")

    assert sent == 0
    assert fake.sent == []  # no pointless round trip


async def test_a_dead_token_is_forgotten(
    client: AsyncClient,
    recipient: Account,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Expo reports DeviceNotRegistered once an app is uninstalled. Keeping the
    token would mean pushing into the void for ever."""
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )

    _patch_client(
        monkeypatch,
        _FakeClient(
            receipts=[
                {
                    "status": "error",
                    "message": "not registered",
                    "details": {"error": "DeviceNotRegistered"},
                }
            ]
        ),
    )

    sent = await push.send_to_user(db, recipient.id, "hello")

    assert sent == 0
    assert (
        await db.scalar(select(DeviceToken).where(DeviceToken.token == TOKEN))
        is None
    )


async def test_an_ordinary_rejection_keeps_the_token(
    client: AsyncClient,
    recipient: Account,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A message rejected for any other reason says nothing about the device."""
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )

    _patch_client(
        monkeypatch,
        _FakeClient(
            receipts=[
                {
                    "status": "error",
                    "message": "message too big",
                    "details": {"error": "MessageTooBig"},
                }
            ]
        ),
    )

    await push.send_to_user(db, recipient.id, "hello")

    assert (
        await db.scalar(select(DeviceToken).where(DeviceToken.token == TOKEN))
        is not None
    )


async def test_a_failing_push_service_never_raises(
    client: AsyncClient,
    recipient: Account,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Push is a courtesy on top of a notification row that is already saved.
    Expo being down must not turn a successful claim into an error."""
    await client.post(
        "/devices", headers=recipient.headers, json={"token": TOKEN}
    )

    class _Exploding(_FakeClient):
        async def post(self, *_: object, **__: object) -> _FakeResponse:
            raise RuntimeError("expo is down")

    _patch_client(monkeypatch, _Exploding())

    assert await push.send_to_user(db, recipient.id, "hello") == 0


async def test_the_in_app_notification_survives_push_being_off(
    client: AsyncClient, organizer: Account, recipient: Account
) -> None:
    """The whole suite runs with push_enabled=False. The row is the real
    record, and has to be written regardless."""
    from tests.test_listings import post_listing

    listing = await post_listing(client, organizer)
    await client.post(
        "/claims", headers=recipient.headers, json={"listing_id": listing["id"]}
    )

    notes = (
        await client.get("/notifications", headers=organizer.headers)
    ).json()
    assert notes["unread_count"] == 1
