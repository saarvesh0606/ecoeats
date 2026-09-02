"""A development-only token verifier.

Real sign-in needs a verified Firebase account and a live inbox to confirm it
from, which would block client development until real accounts exist. This
verifier lets a dev token stand in for one.

It is dangerous by nature — a dev token authenticates as anyone — so it is
locked down hard:

  * off unless DEV_AUTH_BYPASS is explicitly true
  * the app refuses to *start* if it is ever true in production (see
    api.main._build_verifier)
  * it only mints already-verified identities, on whatever domain the
    deployment restricts accounts to, so every downstream authorisation rule
    (verified email, domain, role) still applies exactly as in production —
    the bypass replaces token *verification*, nothing else

Dev tokens look like ``dev:organizer`` or ``dev:recipient``. Any real Firebase
token is passed through to the fallback verifier untouched, so genuine sign-in
keeps working alongside it.
"""

import re

from api.auth.tokens import InvalidTokenError, TokenVerifier, VerifiedIdentity

DEV_PREFIX = "dev:"
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")

#: RFC 2606 reserves example.com precisely so it can be used like this: it
#: resolves nowhere and can never collide with somebody's real address.
DEFAULT_DEV_DOMAIN = "example.com"


class DevTokenVerifier:
    """Recognises dev tokens; delegates everything else to a real verifier."""

    def __init__(
        self,
        fallback: TokenVerifier | None = None,
        *,
        domain: str = DEFAULT_DEV_DOMAIN,
    ) -> None:
        self._fallback = fallback
        # Follows Settings.allowed_email_domain when one is set. Otherwise
        # turning the domain gate on would reject every dev token, and the
        # bypass would look broken rather than restricted.
        self._domain = domain

    def verify(self, token: str) -> VerifiedIdentity:
        if token.startswith(DEV_PREFIX):
            return self._synthesise(token[len(DEV_PREFIX) :].strip().lower())

        if self._fallback is not None:
            return self._fallback.verify(token)

        raise InvalidTokenError("Invalid or expired token")

    def _synthesise(self, slug: str) -> VerifiedIdentity:
        if not _SLUG_RE.match(slug):
            raise InvalidTokenError("Malformed dev token")
        return VerifiedIdentity(
            uid=f"dev-{slug}",
            email=f"{slug}@{self._domain}",
            email_verified=True,
            name=slug.replace("-", " ").title(),
        )
