"""Rate limiting — an abstraction with in-memory and Redis backends.

At the scale this app targets it runs as several instances behind a load
balancer, so the counter has to be shared: in-memory limiting would let a
client do N requests *per instance*. Redis is the shared store in production;
the in-memory backend is a single-process fallback for local dev and tests.

The algorithm is a fixed window — simple, cheap, and good enough for abuse
control (a burst at a window boundary is acceptable here; we're stopping
hammering, not metering billing).
"""

import logging
import time
from dataclasses import dataclass
from typing import Protocol

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after: int  # seconds until the window resets


class RateLimiter(Protocol):
    async def check(
        self, key: str, *, limit: int, window_seconds: int
    ) -> RateLimitResult:
        """Count one hit against `key`; report whether it's within `limit`."""
        ...

    async def close(self) -> None:
        ...


class InMemoryRateLimiter:
    """Single-process limiter. Correct only for one instance — dev and tests."""

    def __init__(self) -> None:
        self._buckets: dict[str, tuple[int, float]] = {}

    async def check(
        self, key: str, *, limit: int, window_seconds: int
    ) -> RateLimitResult:
        now = time.time()
        window_id = int(now // window_seconds)
        full = f"{key}:{window_id}"
        reset_at = (window_id + 1) * window_seconds

        count, _ = self._buckets.get(full, (0, reset_at))
        count += 1
        self._buckets[full] = (count, reset_at)

        # Opportunistic cleanup so old windows don't accumulate unbounded.
        if len(self._buckets) > 5000:
            self._buckets = {
                k: v for k, v in self._buckets.items() if v[1] > now
            }

        return RateLimitResult(
            allowed=count <= limit,
            remaining=max(0, limit - count),
            retry_after=max(1, int(reset_at - now)),
        )

    async def close(self) -> None:
        self._buckets.clear()


# Atomic INCR + first-hit EXPIRE, returning the count and remaining TTL. Doing
# it in one script avoids the race where a crash between INCR and EXPIRE would
# leave a key that never resets.
_REDIS_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('TTL', KEYS[1])}
"""


class RedisRateLimiter:
    """Shared limiter for multi-instance production."""

    def __init__(self, redis) -> None:  # redis.asyncio.Redis
        from redis.exceptions import RedisError

        self._redis = redis
        self._script = redis.register_script(_REDIS_SCRIPT)
        # Imported here, not at module scope, so redis stays an optional
        # dependency for the in-memory path. OSError covers the socket-level
        # failures redis-py lets through unwrapped.
        self._unavailable = (RedisError, OSError)

    async def check(
        self, key: str, *, limit: int, window_seconds: int
    ) -> RateLimitResult:
        window_id = int(time.time() // window_seconds)
        redis_key = f"rl:{key}:{window_id}"

        try:
            count, ttl = await self._script(
                keys=[redis_key], args=[window_seconds]
            )
        except self._unavailable as exc:
            # FAIL OPEN. The limiter is a protective mechanism, not part of
            # answering the request: if the shared counter is unreachable we
            # let the caller through rather than turning a Redis blip into a
            # 500 on every endpoint. Upstash closes idle connections, so a
            # pooled socket can be dead before we write to it — that is a
            # routine event here, not an emergency.
            logger.warning(
                "Rate limiter unavailable; allowing request",
                extra={"key": key, "error": str(exc)},
            )
            return RateLimitResult(
                allowed=True, remaining=limit, retry_after=0
            )

        retry_after = ttl if ttl and ttl > 0 else window_seconds

        return RateLimitResult(
            allowed=count <= limit,
            remaining=max(0, limit - count),
            retry_after=retry_after,
        )

    async def close(self) -> None:
        await self._redis.aclose()


def build_limiter(redis_url: str | None) -> RateLimiter:
    """Redis when a URL is configured, in-memory otherwise."""
    if redis_url:
        import redis.asyncio as redis_async
        from redis.backoff import ExponentialBackoff
        from redis.exceptions import ConnectionError as RedisConnectionError
        from redis.exceptions import TimeoutError as RedisTimeoutError
        from redis.retry import Retry

        client = redis_async.from_url(
            redis_url,
            decode_responses=True,
            # Upstash drops idle connections. Without a health check a pooled
            # socket is only discovered dead when we write to it, which surfaces
            # as ConnectionError on the first request after a quiet spell.
            health_check_interval=30,
            socket_keepalive=True,
            retry=Retry(ExponentialBackoff(base=0.05, cap=0.5), retries=2),
            retry_on_error=[RedisConnectionError, RedisTimeoutError],
        )
        return RedisRateLimiter(client)
    return InMemoryRateLimiter()


# ---------------------------------------------------------------------------
# Global per-IP middleware
# ---------------------------------------------------------------------------

_EXEMPT_PATHS = frozenset({"/health", "/health/ready"})


def _client_ip(scope: Scope) -> str:
    headers = Headers(scope=scope)
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    """A generous blanket limit per client IP — blunt DoS protection.

    Deliberately generous: on campus WiFi hundreds of students share one public
    IP behind NAT, so a tight per-IP limit would lock out real users. Precise
    protection on expensive actions is done per-user via the `rate_limited`
    dependency, keyed on the authenticated id rather than the shared IP.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        limiter: RateLimiter,
        limit: int,
        window_seconds: int,
    ) -> None:
        self.app = app
        self.limiter = limiter
        self.limit = limit
        self.window_seconds = window_seconds

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if scope["type"] != "http" or scope["path"] in _EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        # Preflight requests carry no credentials and must not be throttled.
        if scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return

        result = await self.limiter.check(
            f"ip:{_client_ip(scope)}",
            limit=self.limit,
            window_seconds=self.window_seconds,
        )
        if not result.allowed:
            await _send_429(send, result.retry_after)
            return

        await self.app(scope, receive, send)


async def _send_429(send: Send, retry_after: int) -> None:
    body = b'{"message":"Too many requests. Please slow down."}'
    await send(
        {
            "type": "http.response.start",
            "status": 429,
            "headers": [
                (b"content-type", b"application/json"),
                (b"retry-after", str(retry_after).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
