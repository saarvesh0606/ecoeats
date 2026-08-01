"""In-app notifications: recent activity for the signed-in user."""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import delete, func, select, update

from api.deps import CurrentUser, DbSession
from api.errors import NotFoundError
from api.models import Notification
from api.schemas.notification import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_NOTIFICATIONS = 50


@router.get("", response_model=NotificationList)
async def list_notifications(db: DbSession, user: CurrentUser) -> NotificationList:
    """The user's recent notifications, newest first, with the unread count."""
    rows = (
        await db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(MAX_NOTIFICATIONS)
        )
    ).all()

    unread = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read.is_(False)
        )
    )

    items = [
        NotificationOut(
            id=str(n.id),
            message=n.message,
            listing_id=str(n.listing_id) if n.listing_id else None,
            read=n.read,
            created_at=n.created_at,
        )
        for n in rows
    ]
    return NotificationList(items=items, unread_count=int(unread or 0))


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(db: DbSession, user: CurrentUser) -> None:
    """Mark every unread notification for the user as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
    )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> None:
    """Remove one notification from the user's feed.

    The user_id is part of the WHERE clause rather than checked after loading:
    that way someone else's id simply matches no rows, so this can't be used to
    probe whether a given notification exists.
    """
    result = await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if result.rowcount == 0:
        raise NotFoundError("That notification is already gone")
