"""A stand-in for Firebase token verification.

Real ID tokens are signed by Google, expire, and need network access to
validate — none of which belongs in a unit test. This issues opaque tokens and
resolves them from an in-memory registry, so tests can express exactly the
identity they need, including ones Firebase would rarely produce (unverified
address, a domain a restricted deployment would refuse).

What it deliberately does *not* do is reimplement the domain and verification
rules. Those live in api.deps and are what the tests exercise.
"""

import uuid

from api.auth.tokens import InvalidTokenError, VerifiedIdentity


class FakeTokenVerifier:
    def __init__(self) -> None:
        self._identities: dict[str, VerifiedIdentity] = {}
        #: uids passed to delete(), so a test can assert the identity was
        #: removed and not merely the database row.
        self.deleted: list[str] = []
        #: uids whose existence cannot be established — the network half of
        #: Firebase being down. Lets a test prove the caller fails closed
        #: rather than treating "don't know" as "gone".
        self.unreachable: set[str] = set()

    def issue(
        self,
        *,
        uid: str | None = None,
        email: str | None = None,
        email_verified: bool = True,
        name: str | None = None,
        picture: str | None = None,
    ) -> str:
        """Mint a token and return it. Defaults describe a valid account."""
        uid = uid or uuid.uuid4().hex[:28]
        identity = VerifiedIdentity(
            uid=uid,
            email=(email if email is not None else f"{uid}@example.com").lower(),
            email_verified=email_verified,
            name=name,
            picture=picture,
        )
        token = f"fake-token-{uid}"
        self._identities[token] = identity
        return token

    def verify(self, token: str) -> VerifiedIdentity:
        try:
            return self._identities[token]
        except KeyError:
            raise InvalidTokenError("Invalid or expired token") from None

    def identity_exists(self, uid: str) -> bool:
        """Whether any token for this uid is still live.

        ``delete`` forgets every token for a uid, so a test can strand a
        profile row exactly the way deleting an account in the Firebase console
        strands one, and then assert what registration does about it.
        """
        if uid in self.unreachable:
            raise RuntimeError("Firebase is unreachable")
        return any(i.uid == uid for i in self._identities.values())

    def delete(self, uid: str) -> None:
        """Forget every token for this uid, the way deleting the real identity
        would — so a test can prove the account really cannot sign in again,
        rather than only that the endpoint returned 204."""
        self.deleted.append(uid)
        for token, identity in list(self._identities.items()):
            if identity.uid == uid:
                del self._identities[token]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
