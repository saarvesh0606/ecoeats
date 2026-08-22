"""Firebase implementation of TokenVerifier."""

import json
import logging
from pathlib import Path

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from api.auth.tokens import InvalidTokenError, VerifiedIdentity

logger = logging.getLogger(__name__)


class FirebaseTokenVerifier:
    """Verifies Google-signed Firebase ID tokens.

    ``check_revoked=True`` costs an extra lookup per request but means signing
    a user out actually ends their session. Without it a stolen token stays
    valid until it expires on its own.
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
            claims = firebase_auth.verify_id_token(
                token, app=self._app, check_revoked=True
            )
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
        try:
            firebase_auth.delete_user(uid, app=self._app)
        except firebase_auth.UserNotFoundError:
            logger.info("Identity %s was already gone", uid)
        except Exception as exc:
            logger.warning(
                "Could not delete identity %s: %s", uid, type(exc).__name__
            )
