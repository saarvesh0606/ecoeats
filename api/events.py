"""Real-time listing events — an event bus with in-memory and Redis backends.

Replaces the client's 20-second polling. At thousands of users, polling means
thousands of feed queries a minute hammering the database for data that rarely
changed; a push channel sends one small message only when something actually
does.

Across multiple API instances a client is connected to just one of them, but a
claim might be handled by another — so events fan out through Redis pub/sub:
whichever instance makes a change publishes to a channel every instance is
subscribed to, and each forwards to its own connected clients. The in-memory
bus is the single-instance fallback for dev and tests.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

CHANNEL = "ecoeats:listing-events"


@dataclass(frozen=True, slots=True)
class ListingEvent:
    """A change to a listing that the feed cares about.

    One shape covers everything the client needs: patch the card's quantity and
    status, drop it when it's no longer active or has run out, and fetch-and-
    insert when an id arrives for a listing the client doesn't have yet (a new
    post). ``expires_at`` lets the client keep its countdown correct.
    """

    listing_id: str
    quantity_remaining: int
    status: str
    expires_at: str

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "ListingEvent":
        return cls(**json.loads(raw))


class EventBus(Protocol):
    async def publish(self, event: ListingEvent) -> None: ...

    def subscribe(self):
        """An async context manager yielding a queue of incoming events."""
        ...

    async def start(self) -> None: ...

    async def close(self) -> None: ...


class _LocalFanout:
    """Shared machinery: a set of per-subscriber queues to fan out to."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[ListingEvent]] = set()

    def _dispatch(self, event: ListingEvent) -> None:
        for queue in self._subscribers:
            # Bounded so one slow/stuck client can't grow memory without limit;
            # if it can't keep up we drop for that client rather than everyone.
            if queue.full():
                continue
            queue.put_nowait(event)

    @asynccontextmanager
    async def _subscription(
        self,
    ) -> "AsyncIterator[asyncio.Queue[ListingEvent]]":
        # Hands back the queue itself, not a wrapping async generator. Consumers
        # call ``queue.get()`` (often inside asyncio.wait_for for a heartbeat) —
        # a cancelled get leaves the queue usable, whereas cancelling a wrapped
        # generator's anext exhausts it and the next call raises inside the
        # caller's async generator (PEP 479).
        queue: asyncio.Queue[ListingEvent] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)


class InMemoryEventBus(_LocalFanout):
    """Single-process bus. Correct only for one instance — dev and tests."""

    async def publish(self, event: ListingEvent) -> None:
        self._dispatch(event)

    def subscribe(self):
        return self._subscription()

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        return None


class RedisEventBus(_LocalFanout):
    """Fans out across instances via Redis pub/sub.

    Publishing always goes through Redis — including back to this instance — so
    every instance handles every event identically, wherever the change was
    made.
    """

    def __init__(self, redis) -> None:  # redis.asyncio.Redis
        super().__init__()
        self._redis = redis
        self._pubsub = None
        self._reader: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(CHANNEL)
        self._reader = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        assert self._pubsub is not None
        try:
            async for message in self._pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    self._dispatch(ListingEvent.from_json(message["data"]))
                except Exception:
                    logger.exception("Bad listing event on the bus")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Redis event reader stopped unexpectedly")

    async def publish(self, event: ListingEvent) -> None:
        await self._redis.publish(CHANNEL, event.to_json())

    def subscribe(self):
        return self._subscription()

    async def close(self) -> None:
        if self._reader is not None:
            self._reader.cancel()
            try:
                await self._reader
            except asyncio.CancelledError:
                pass
        if self._pubsub is not None:
            await self._pubsub.unsubscribe(CHANNEL)
            await self._pubsub.aclose()


def listing_event(listing) -> ListingEvent:
    """Build an event from a Listing model (duck-typed to avoid an import cycle)."""
    status = listing.status
    return ListingEvent(
        listing_id=str(listing.id),
        quantity_remaining=listing.quantity_remaining,
        status=status.value if hasattr(status, "value") else str(status),
        expires_at=listing.expires_at.isoformat(),
    )


def build_event_bus(redis_url: str | None) -> EventBus:
    if redis_url:
        import redis.asyncio as redis_async

        return RedisEventBus(redis_async.from_url(redis_url, decode_responses=True))
    return InMemoryEventBus()
