"""One way to tell a user something.

Before this, each place that mattered added a `Notification` row by hand. Push
has to happen at exactly those moments and with exactly that wording, and three
hand-written copies would have drifted the first time one of them changed. So
they go through here together, or not at all.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.models import Notification
from api.services import push

logger = logging.getLogger(__name__)


async def _deliver(
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    message: str,
    listing_id: str | None,
    access_token: str | None,
) -> None:
    """Send after the response, on a session of our own.

    The request's session is closed by the time a background task runs, and
    pruning a dead token is a write, so this needs its own — and its own commit.
    """
    try:
        async with session_factory() as session:
            await push.send_to_user(
                session,
                user_id,
                message,
                listing_id=listing_id,
                access_token=access_token,
            )
            await session.commit()
    except Exception:
        logger.warning("push task failed for user %s", user_id, exc_info=True)


def notify(
    db: AsyncSession,
    request: Request,
    background_tasks: BackgroundTasks,
    *,
    user_id: str,
    message: str,
    listing_id: uuid.UUID | None = None,
) -> None:
    """Record activity for a user, and push it to their devices.

    The row is the real record and is written in the caller's transaction. The
    push is queued for after the response: it is a courtesy, it talks to a
    third party over the network, and nothing about it should be able to slow
    down or fail the claim that caused it.
    """
    db.add(
        Notification(user_id=user_id, message=message, listing_id=listing_id)
    )

    settings = request.app.state.settings
    if not getattr(settings, "push_enabled", True):
        return

    background_tasks.add_task(
        _deliver,
        request.app.state.session_factory,
        user_id,
        message,
        str(listing_id) if listing_id else None,
        getattr(settings, "expo_access_token", None),
    )


__all__ = ["notify"]
