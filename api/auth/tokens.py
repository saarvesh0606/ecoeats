"""Identity token verification.

The rest of the application depends on the ``TokenVerifier`` protocol rather
than on Firebase directly. That keeps the auth rules — domain restriction,
verified-email enforcement — testable without network access, real credentials,
or a way to mint genuine Google-signed tokens.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    """The subset of a verified token we trust and act on.

    Everything here comes from a cryptographically verified token. None of it
    is ever accepted from a request body — v1 took the host's name from client
    input, which let a caller post as somebody else.
    """

    uid: str
    email: str
    email_verified: bool
    name: str | None = None
    picture: str | None = None


class InvalidTokenError(Exception):
    """The token was absent, malformed, expired, revoked, or not ours."""


class TokenVerifier(Protocol):
    def verify(self, token: str) -> VerifiedIdentity:
        """Return the identity, or raise InvalidTokenError."""
        ...

    def delete(self, uid: str) -> None:
        """Remove the identity entirely, so the account cannot sign in again.

        Part of this protocol rather than a direct firebase_admin call in the
        route, for the same reason verification is: deleting an account has to
        be testable without network access or real credentials.

        Deleting an identity that is already gone is not an error — the caller
        wants it absent, and it is.
        """
        ...
