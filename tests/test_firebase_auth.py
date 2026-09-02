"""The revocation check and the cache that keeps it off the network.

firebase_admin's ``check_revoked=True`` fetches the account record from Google
on every verification. On a single-worker service that round trip, not the CPU,
is what caps throughput — so the fetch is cached for a minute. These tests pin
both halves of that bargain: the fetching is rare, and the *checking* is not
weakened by it.

Nothing here touches Firebase. The cache takes its fetch function and its clock
as arguments precisely so it can be exercised without a network or a real
credential.
"""

import pytest

from api.auth.firebase import (
    FirebaseTokenVerifier,
    _AccountState,
    _AccountStateCache,
    _DisabledAccountError,
    _RevokedTokenError,
)

LIVE = _AccountState(disabled=False, tokens_valid_after_ms=0)


class Clock:
    """A hand-wound monotonic clock, so TTLs expire without sleeping."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class Fetcher:
    """Counts how often the cache actually goes and asks."""

    def __init__(self, state: _AccountState = LIVE) -> None:
        self.state = state
        self.calls: list[str] = []

    def __call__(self, uid: str) -> _AccountState:
        self.calls.append(uid)
        return self.state


# --------------------------------------------------------------------------
# The cache
# --------------------------------------------------------------------------


def test_repeat_lookups_within_the_ttl_do_not_refetch() -> None:
    fetch = Fetcher()
    cache = _AccountStateCache(fetch, ttl_seconds=60, clock=Clock())

    for _ in range(50):
        assert cache.get("u1") == LIVE

    # The whole point: 50 requests, one round trip to Google.
    assert fetch.calls == ["u1"]


def test_each_account_is_cached_separately() -> None:
    fetch = Fetcher()
    cache = _AccountStateCache(fetch, ttl_seconds=60, clock=Clock())

    cache.get("u1")
    cache.get("u2")
    cache.get("u1")

    assert fetch.calls == ["u1", "u2"]


def test_the_entry_expires_and_is_fetched_again() -> None:
    fetch = Fetcher()
    clock = Clock()
    cache = _AccountStateCache(fetch, ttl_seconds=60, clock=clock)

    cache.get("u1")
    clock.advance(59)
    cache.get("u1")  # still inside the window
    assert fetch.calls == ["u1"]

    clock.advance(2)  # now past it
    cache.get("u1")
    assert fetch.calls == ["u1", "u1"]


def test_forget_forces_the_next_lookup_to_ask_again() -> None:
    fetch = Fetcher()
    cache = _AccountStateCache(fetch, ttl_seconds=60, clock=Clock())

    cache.get("u1")
    cache.forget("u1")
    cache.get("u1")

    assert fetch.calls == ["u1", "u1"]


def test_forgetting_an_account_that_was_never_cached_is_not_an_error() -> None:
    cache = _AccountStateCache(Fetcher(), ttl_seconds=60, clock=Clock())
    cache.forget("never-seen")  # must not raise


def test_expired_entries_are_swept_at_the_ceiling() -> None:
    fetch = Fetcher()
    clock = Clock()
    cache = _AccountStateCache(
        fetch, ttl_seconds=60, max_entries=10, clock=clock
    )

    for n in range(10):
        cache.get(f"old-{n}")
    clock.advance(61)  # every one of them is now stale
    cache.get("fresh")

    # The stale ten are gone rather than accumulating for the life of the
    # process; only the entry just written survives.
    assert set(cache._entries) == {"fresh"}


# --------------------------------------------------------------------------
# The check itself — a cache hit must not weaken it
# --------------------------------------------------------------------------


def verifier_with(state: _AccountState) -> FirebaseTokenVerifier:
    """A verifier wired to a fixed account state.

    Built without ``__init__`` deliberately: that path loads a service-account
    certificate and initialises a global firebase_admin app, neither of which a
    unit test can or should have. Only the cache is needed here.
    """
    verifier = object.__new__(FirebaseTokenVerifier)
    verifier._accounts = _AccountStateCache(
        Fetcher(state), ttl_seconds=60, clock=Clock()
    )
    return verifier


def test_a_current_token_passes() -> None:
    verifier = verifier_with(LIVE)
    verifier._check_revoked({"uid": "u1", "iat": 1_700_000_000})


def test_a_token_issued_before_a_revocation_is_rejected() -> None:
    # Tokens were revoked at iat 1_700_000_100 (expressed in ms).
    verifier = verifier_with(
        _AccountState(disabled=False, tokens_valid_after_ms=1_700_000_100_000)
    )

    with pytest.raises(_RevokedTokenError):
        verifier._check_revoked({"uid": "u1", "iat": 1_700_000_000})


def test_a_token_issued_after_a_revocation_still_passes() -> None:
    verifier = verifier_with(
        _AccountState(disabled=False, tokens_valid_after_ms=1_700_000_100_000)
    )

    verifier._check_revoked({"uid": "u1", "iat": 1_700_000_200})


def test_a_disabled_account_is_rejected() -> None:
    verifier = verifier_with(
        _AccountState(disabled=True, tokens_valid_after_ms=0)
    )

    with pytest.raises(_DisabledAccountError):
        verifier._check_revoked({"uid": "u1", "iat": 1_700_000_000})


def test_the_revocation_verdict_is_per_token_not_per_account() -> None:
    """The cached fact is the account's; the comparison is still each token's.

    This is what makes caching safe — one cached fetch still tells an old token
    apart from a new one for the same user.
    """
    verifier = verifier_with(
        _AccountState(disabled=False, tokens_valid_after_ms=1_700_000_100_000)
    )

    verifier._check_revoked({"uid": "u1", "iat": 1_700_000_200})
    with pytest.raises(_RevokedTokenError):
        verifier._check_revoked({"uid": "u1", "iat": 1_700_000_000})
