"""Revoking a Sign in with Apple authorisation.

Apple requires that an app offering account deletion also revokes the user's
Apple authorisation when they delete (App Store Review Guideline 5.1.1(v)).
Without it the app stays authorised for that Apple ID forever, which is not
only a review problem but a user-visible one: Apple stops re-prompting, so a
person who deletes their account and signs up again is silently given no name
and no email, and lands in a half-empty account.

The whole exchange is authenticated by a **client secret that is a JWT we mint
ourselves** — there is no static secret to hold. It is signed ES256 with the
`.p8` key from the Apple Developer portal, and Apple checks it against the key
id in the header and the team in the issuer.

Dormant until configured, deliberately: with no key this module does nothing
and says so once, exactly like Sentry with no DSN. That keeps dev and tests
free of Apple credentials, and means a missing key degrades the delete to what
it does today rather than failing it.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import httpx
import jwt

from api.config import Settings

logger = logging.getLogger(__name__)

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
APPLE_AUDIENCE = "https://appleid.apple.com"

#: Apple caps a client secret at six months. Ours lives for one exchange, so
#: minutes are plenty and a leaked one is worth almost nothing.
CLIENT_SECRET_TTL_SECONDS = 300

#: Apple is a courtesy on a path that has already done the important work.
TIMEOUT_SECONDS = 10.0


class AppleAuthError(Exception):
    """Apple refused, or could not be reached."""


class AppleClient:
    """Talks to Apple's token endpoints on behalf of one app.

    ``client_id`` is the app's **bundle identifier** for a native iOS sign-in —
    not a Services ID, which is what web and Android flows use. Getting that
    wrong returns `invalid_client` with nothing to say which half is wrong.
    """

    def __init__(
        self,
        *,
        team_id: str,
        key_id: str,
        private_key: str,
        client_id: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._team_id = team_id
        self._key_id = key_id
        self._private_key = private_key
        self._client_id = client_id
        # A seam for tests only. httpx.MockTransport is the supported way to
        # exercise this without reaching Apple, and reaching Apple from a test
        # would need the real key and would revoke a real person's session.
        self._transport = transport

    def _client_secret(self) -> str:
        now = int(time.time())
        return jwt.encode(
            {
                "iss": self._team_id,
                "iat": now,
                "exp": now + CLIENT_SECRET_TTL_SECONDS,
                "aud": APPLE_AUDIENCE,
                "sub": self._client_id,
            },
            self._private_key,
            algorithm="ES256",
            headers={"kid": self._key_id},
        )

    async def _post(self, url: str, form: dict[str, str]) -> httpx.Response:
        async with httpx.AsyncClient(
            timeout=TIMEOUT_SECONDS, transport=self._transport
        ) as client:
            return await client.post(
                url,
                data={
                    **form,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret(),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

    async def exchange_code(self, authorization_code: str) -> str:
        """Trade the one-shot code from sign-in for a refresh token.

        The code is valid for five minutes and once only, which is why this
        happens at sign-in rather than being deferred to deletion — by then
        there is nothing left to exchange.
        """
        response = await self._post(
            APPLE_TOKEN_URL,
            {"code": authorization_code, "grant_type": "authorization_code"},
        )
        if response.status_code != 200:
            raise AppleAuthError(
                f"Apple refused the authorization code ({response.status_code})"
            )
        token = response.json().get("refresh_token")
        if not token:
            raise AppleAuthError("Apple returned no refresh token")
        return str(token)

    async def revoke(self, refresh_token: str) -> None:
        """Withdraw the authorisation. Apple answers 200 with an empty body."""
        response = await self._post(
            APPLE_REVOKE_URL,
            {"token": refresh_token, "token_type_hint": "refresh_token"},
        )
        if response.status_code != 200:
            raise AppleAuthError(
                f"Apple refused the revocation ({response.status_code})"
            )


def build_apple_client(settings: Settings) -> AppleClient | None:
    """The configured client, or None when Apple credentials are absent.

    None is a supported state, not a broken one — it is what dev, tests and any
    deployment without the key run as.
    """
    key = settings.apple_private_key
    if not (settings.apple_team_id and settings.apple_key_id and key):
        return None
    return AppleClient(
        team_id=settings.apple_team_id,
        key_id=settings.apple_key_id,
        private_key=key,
        client_id=settings.apple_client_id,
    )


def read_private_key(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")
