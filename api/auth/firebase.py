"""Firebase implementation of TokenVerifier."""

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from api.auth.tokens import InvalidTokenError, VerifiedIdentity

logger = logging.getLogger(__name__)

#: How long an account's revocation state is trusted before Google is asked
#: again. The window this opens is bounded and small: a revoked token is
#: accepted for at most this long, against the hour it would otherwise stay
#: valid with no revocation check at all.
REVOCATION_TTL_SECONDS = 60

#: Ceiling on cached accounts, so a long-running process cannot grow without
#: bound. Far above any plausible number of users active within one TTL.
MAX_CACHED_ACCOUNTS = 10_000


class _RevokedTokenError(Exception):
    """Minted before the account's tokens were revoked."""


class _DisabledAccountError(Exception):
    """The account has been disabled in Firebase."""


@dataclass(frozen=True, slots=True)
class _AccountState:
    """The two account facts a revocation check needs from Google."""

    disabled: bool
    tokens_valid_after_ms: int


class _AccountStateCache:
    """Account state by uid, remembered briefly.

    Exists because firebase_admin's ``check_revoked=True`` fetches the user
    record from Google on *every* verification — a blocking network round trip
    on the request path. One worker serving requests one at a time means that
    round trip, not the CPU, sets the throughput ceiling.

    Caching turns it into one fetch per user per TTL. Correctness is unchanged
    for the part that varies per token: only the *account* facts are cached,
    and each token's own ``iat`` is still compared against them, so a cache hit
    still rejects a token issued before the revocation it knows about.

    Takes its clock as an argument so expiry is testable without sleeping.
    """

    def __init__(
        self,
        fetch: Callable[[str], _AccountState],
        *,
        ttl_seconds: float,
        max_entries: int = MAX_CACHED_ACCOUNTS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetch = fetch
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: dict[str, tuple[_AccountState, float]] = {}

    def get(self, uid: str) -> _AccountState:
        now = self._clock()
        cached = self._entries.get(uid)
        if cached is not None and cached[1] > now:
            return cached[0]

        state = self._fetch(uid)

        # Verification runs in a worker thread, so two requests for the same
        # uid can race here. Both write the same value, and an entry dropped by
        # the sweep below costs one extra fetch — neither is worth a lock on
        # the hot path.
        if len(self._entries) >= self._max_entries:
            self._entries = {
                key: value
                for key, value in self._entries.items()
                if value[1] > now
            }
        self._entries[uid] = (state, now + self._ttl)
        return state

    def forget(self, uid: str) -> None:
        """Drop what we remember, so the next check asks Google again."""
        self._entries.pop(uid, None)


class FirebaseTokenVerifier:
    """Verifies Google-signed Firebase ID tokens.

    Revocation is checked on every request — signing a user out has to actually
    end their session, and without the check a stolen token stays valid until
    it expires on its own. What is *not* done on every request is asking Google
    for the account record; see ``_AccountStateCache``.
    """

    def __init__(
        self,
        *,
        project_id: str,
        credentials_path: str | Path | None = None,
        credentials_json: str | None = None,
    ) -> None:
        cert = self._load_certificate(credentials_path, credentials_json)

        # firebase_admin keeps a process-global app registry, so re-initialising
        # raises. Reuse the existing app when there is one.
        try:
            self._app = firebase_admin.get_app()
        except ValueError:
            self._app = firebase_admin.initialize_app(
                cert, {"projectId": project_id}
            )

        self._accounts = _AccountStateCache(
            self._fetch_account_state, ttl_seconds=REVOCATION_TTL_SECONDS
        )

    @staticmethod
    def _load_certificate(
        credentials_path: str | Path | None, credentials_json: str | None
    ) -> credentials.Certificate:
        # JSON in an env var takes precedence — it's how production containers
        # inject the secret, without a file on disk.
        if credentials_json:
            try:
                return credentials.Certificate(json.loads(credentials_json))
            except (ValueError, json.JSONDecodeError) as exc:
                raise ValueError(
                    "FIREBASE_CREDENTIALS_JSON is not valid service-account JSON"
                ) from exc

        if credentials_path:
            path = Path(credentials_path)
            if not path.is_file():
                raise FileNotFoundError(
                    f"Firebase service account not found at {path}. "
                    "Download it from Firebase console → Project settings → "
                    "Service accounts → Generate new private key."
                )
            return credentials.Certificate(str(path))

        raise ValueError(
            "Firebase needs either FIREBASE_CREDENTIALS_PATH or "
            "FIREBASE_CREDENTIALS_JSON."
        )

    def verify(self, token: str) -> VerifiedIdentity:
        try:
            # check_revoked stays False: it would make firebase_admin fetch the
            # user record from Google inline, on every single request. The same
            # check runs below, against state that is cached for a minute.
            claims = firebase_auth.verify_id_token(token, app=self._app)
            self._check_revoked(claims)
        except Exception as exc:
            # Deliberately opaque to the caller. The reason a token failed is
            # useful to an attacker and useless to a legitimate client, which
            # can only ever respond by signing in again.
            logger.info("Rejected ID token: %s", type(exc).__name__)
            raise InvalidTokenError("Invalid or expired token") from exc

        email = claims.get("email")
        if not email:
            raise InvalidTokenError("Token carries no email address")

        return VerifiedIdentity(
            uid=claims["uid"],
            email=email.lower(),
            email_verified=bool(claims.get("email_verified", False)),
            name=claims.get("name"),
            picture=claims.get("picture"),
        )

    def _check_revoked(self, claims: dict) -> None:
        """Reject a token the account has since invalidated.

        Mirrors firebase_admin's own ``_check_jwt_revoked_or_disabled``: a token
        issued before ``tokens_valid_after_timestamp`` was left behind by a
        sign-out-everywhere, and a disabled account may not authenticate at all.
        """
        state = self._accounts.get(claims["uid"])
        if state.disabled:
            raise _DisabledAccountError("The user record is disabled")
        if claims["iat"] * 1000 < state.tokens_valid_after_ms:
            raise _RevokedTokenError("The Firebase ID token has been revoked")

    def _fetch_account_state(self, uid: str) -> _AccountState:
        record = firebase_auth.get_user(uid, app=self._app)
        return _AccountState(
            disabled=bool(record.disabled),
            tokens_valid_after_ms=int(record.tokens_valid_after_timestamp or 0),
        )

    def delete(self, uid: str) -> None:
        """Remove the Firebase account behind a deleted profile.

        Without this, deleting an account leaves the identity able to sign in
        again — landing on role selection as if brand new, with the same email
        that is meant to be gone.

        An identity that is already absent is the outcome the caller wanted, so
        that is not raised. Anything else is logged and swallowed: the database
        row is already deleted by the time this runs, and failing the request
        afterwards would tell the user their deletion did not happen when most
        of it did.
        """
        # Before the call, not after: the cached state is stale either way, and
        # dropping it first means a delete that half-fails cannot leave the
        # account authenticating from cache for the rest of the TTL.
        self._accounts.forget(uid)
        try:
            firebase_auth.delete_user(uid, app=self._app)
        except firebase_auth.UserNotFoundError:
            logger.info("Identity %s was already gone", uid)
        except Exception as exc:
            logger.warning(
                "Could not delete identity %s: %s", uid, type(exc).__name__
            )
