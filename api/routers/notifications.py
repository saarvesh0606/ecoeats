"""In-app notifications: recent activity for the signed-in user."""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import delete, func, select, update

from api.deps import CurrentUser, DbSession
from api.errors import NotFoundError
from api.models import Listing, ListingPhoto, Notification
from api.schemas.notification import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_NOTIFICATIONS = 50


@router.get("", response_model=NotificationList)
async def list_notifications(db: DbSession, user: CurrentUser) -> NotificationList:
    """The user's recent notifications, newest first, with the unread count."""
    # The listing's first photo, which is the thumbnail everywhere else too.
    # A correlated subquery rather than a join: joining the photos table would
    # multiply the notification rows and then need de-duplicating.
    thumbnail = (
        select(ListingPhoto.url)
        .where(ListingPhoto.listing_id == Listing.id)
        .order_by(ListingPhoto.position)
        .limit(1)
        .correlate(Listing)
        .scalar_subquery()
    )

    # Outer join: listing_id is nullable, and the FK is SET NULL, so a
    # notification about a since-deleted post must still come back.
    rows = (
        await db.execute(
            select(Notification, Listing.title, thumbnail.label("photo_url"))
            .outerjoin(Listing, Notification.listing_id == Listing.id)
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
            kind=n.kind,
            listing_id=str(n.listing_id) if n.listing_id else None,
            listing_title=title,
            listing_photo_url=photo_url,
            read=n.read,
            created_at=n.created_at,
        )
        for n, title, photo_url in rows
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


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_notifications(db: DbSession, user: CurrentUser) -> None:
    """Remove every notification for the user.

    Declared before /{notification_id} so an empty path segment can never be
    read as an id.

    Deliberately not an error when there is nothing to clear. The caller is
    asking for an empty list, and an empty list is what they get; failing here
    would only mean the client had to check first to avoid an error it would
    then ignore.
    """
    await db.execute(delete(Notification).where(Notification.user_id == user.id))


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
