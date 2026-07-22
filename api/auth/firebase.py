"""Firebase implementation of TokenVerifier."""

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

    def __init__(self, *, project_id: str, credentials_path: str | Path) -> None:
        path = Path(credentials_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Firebase service account not found at {path}. "
                "Download it from Firebase console → Project settings → "
                "Service accounts → Generate new private key."
            )

        # firebase_admin keeps a process-global app registry, so re-initialising
        # raises. Reuse the existing app when there is one.
        try:
            self._app = firebase_admin.get_app()
        except ValueError:
            self._app = firebase_admin.initialize_app(
                credentials.Certificate(str(path)),
                {"projectId": project_id},
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
