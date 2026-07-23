"""A development-only token verifier.

Real sign-in needs a verified @asu.edu Firebase account, which is impossible to
create without an actual ASU inbox. That would block all client development
until real accounts exist. This verifier lets a dev token stand in for one.

It is dangerous by nature — a dev token authenticates as anyone — so it is
locked down hard:

  * off unless DEV_AUTH_BYPASS is explicitly true
  * the app refuses to *start* if it is ever true in production (see
    api.main._build_verifier)
  * it only mints @asu.edu, already-verified identities, so every downstream
    authorisation rule (ASU-only, verified email, role) still applies exactly
    as in production — the bypass replaces token *verification*, nothing else

Dev tokens look like ``dev:organizer`` or ``dev:recipient``. Any real Firebase
token is passed through to the fallback verifier untouched, so genuine sign-in
keeps working alongside it.
"""

import re

from api.auth.tokens import InvalidTokenError, TokenVerifier, VerifiedIdentity

DEV_PREFIX = "dev:"
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


class DevTokenVerifier:
    """Recognises dev tokens; delegates everything else to a real verifier."""

    def __init__(self, fallback: TokenVerifier | None = None) -> None:
        self._fallback = fallback

    def verify(self, token: str) -> VerifiedIdentity:
        if token.startswith(DEV_PREFIX):
            return self._synthesise(token[len(DEV_PREFIX) :].strip().lower())

        if self._fallback is not None:
            return self._fallback.verify(token)

        raise InvalidTokenError("Invalid or expired token")

    @staticmethod
    def _synthesise(slug: str) -> VerifiedIdentity:
        if not _SLUG_RE.match(slug):
            raise InvalidTokenError("Malformed dev token")
        return VerifiedIdentity(
            uid=f"dev-{slug}",
            email=f"{slug}@asu.edu",
            email_verified=True,
            name=slug.replace("-", " ").title(),
        )
