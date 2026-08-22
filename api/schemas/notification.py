"""Response shapes for in-app notifications."""

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    message: str

    #: What happened — "claim", "pickup", "rating", or "activity" for anything
    #: written before this was recorded. The client maps it to an icon, and
    #: treats anything it doesn't recognise as "activity" rather than failing.
    kind: str

    listing_id: str | None

    #: Enough of the listing to show the food the notification is about. Both
    #: are null when the listing has been deleted (the FK is SET NULL) or when
    #: the post never had a photo — the row still has to render.
    listing_title: str | None = None
    listing_photo_url: str | None = None

    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int
