"""Delivery of push notifications through Expo's push service.

Expo sits in front of APNs and FCM, so the API here is one HTTP call with a
list of tokens rather than two vendor integrations. The credentials that
actually matter (an APNs key, an FCM service account) live in the Expo project,
not in this codebase — which is why this module works without any secret and
still delivers nothing until those are uploaded.

Nothing here is allowed to break the request that triggered it. A push is a
courtesy on top of a row in `notifications`, which is the real record and is
already committed by the time we get here; if the send fails, the user still
sees the notification the next time they open the app.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import DeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

#: Expo caps a single request at 100 messages.
BATCH_SIZE = 100

#: Push is a courtesy; it must never hold a request open.
TIMEOUT_SECONDS = 10.0

#: Expo's way of saying a token is dead — the app was uninstalled, or the token
#: was rotated. Keeping it would mean pushing into the void forever.
DEAD_TOKEN_ERROR = "DeviceNotRegistered"


def _message(token: str, body: str, listing_id: str | None) -> dict[str, Any]:
    """One Expo push message.

    `data` is what the app reads when the user taps the notification, and is the
    only reason tapping can open the right listing rather than just the app.
    """
    payload: dict[str, Any] = {
        "to": token,
        "title": "EcoEats",
        "body": body,
        "sound": "default",
        # Collapse by listing so ten claims on one post don't stack into ten
        # separate lines on the lock screen.
        "channelId": "default",
    }
    if listing_id:
        payload["data"] = {"listingId": listing_id}
    return payload


async def _post_batch(
    client: httpx.AsyncClient, batch: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    response = await client.post(EXPO_PUSH_URL, json=batch)
    response.raise_for_status()
    body = response.json()
    data = body.get("data")
    # Expo returns a list of receipts matching the request order. A dict comes
    # back only for a whole-request error, which raise_for_status usually
    # catches first.
    return data if isinstance(data, list) else []


async def _prune(db: AsyncSession, tokens: list[str]) -> None:
    """Forget tokens Expo has told us are dead."""
    if not tokens:
        return
    await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(tokens)))
    logger.info("pruned %d dead push token(s)", len(tokens))


async def send_to_user(
    db: AsyncSession,
    user_id: str,
    body: str,
    *,
    listing_id: str | None = None,
    access_token: str | None = None,
) -> int:
    """Push `body` to every device `user_id` has registered.

    Returns how many messages Expo accepted. Never raises: the caller is a
    request handler that has already done the thing worth doing.
    """
    tokens = list(
        (
            await db.scalars(
                select(DeviceToken.token).where(DeviceToken.user_id == user_id)
            )
        ).all()
    )
    if not tokens:
        return 0

    messages = [_message(t, body, listing_id) for t in tokens]
    headers = {"Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    accepted = 0
    dead: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            for start in range(0, len(messages), BATCH_SIZE):
                batch = messages[start : start + BATCH_SIZE]
                receipts = await _post_batch(client, batch)
                for message, receipt in zip(batch, receipts, strict=False):
                    if receipt.get("status") == "ok":
                        accepted += 1
                        continue
                    details = receipt.get("details") or {}
                    if details.get("error") == DEAD_TOKEN_ERROR:
                        dead.append(str(message["to"]))
                    else:
                        logger.warning("push rejected: %s", receipt.get("message"))
    except Exception:
        # Network trouble, a 5xx from Expo, malformed JSON — none of it is worth
        # failing a claim over.
        logger.warning("push delivery failed for user %s", user_id, exc_info=True)
        return accepted

    await _prune(db, dead)
    return accepted


__all__ = ["EXPO_PUSH_URL", "send_to_user"]
