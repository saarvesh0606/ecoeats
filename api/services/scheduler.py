"""Periodic background work.

A plain asyncio task rather than a scheduling library. The job list is two
entries long, both idempotent and both row-locked, so a cron framework would be
more moving parts than the problem has.

Running several web workers means several sweepers, which is harmless: each
claim is resolved under a row lock and re-checked after acquiring it, so a
second sweeper finds nothing to do.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.services.claims import expire_stale_listings, sweep_expired_reservations

logger = logging.getLogger(__name__)

Sweep = Callable[[async_sessionmaker[AsyncSession]], Awaitable[int]]

SWEEPS: dict[str, Sweep] = {
    "expired reservations": sweep_expired_reservations,
    "finished listings": expire_stale_listings,
}


async def run_sweeps(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """One pass over every sweep.

    Each is isolated: a failure is logged and the next one still runs, because
    a broken listing sweep must not stop reservations being released.
    """
    for name, sweep in SWEEPS.items():
        try:
            count = await sweep(session_factory)
            if count:
                logger.info("Swept %d %s", count, name)
        except Exception:
            logger.exception("Sweep failed: %s", name)


async def sweep_forever(
    session_factory: async_sessionmaker[AsyncSession], *, interval_seconds: int
) -> None:
    """Sweep on an interval until cancelled.

    The interval bounds how long a lapsed reservation keeps holding a portion,
    so it wants to be well under the 20-minute reservation window — a minute is
    a reasonable default.
    """
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await run_sweeps(session_factory)
        except asyncio.CancelledError:
            logger.info("Sweeper stopping")
            raise
        except Exception:
            # Never let an unexpected error kill the loop; the next tick tries
            # again. Without this a single blip stops reservations releasing
            # for the lifetime of the process.
            logger.exception("Sweeper tick failed")
