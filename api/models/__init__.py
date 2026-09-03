"""ORM models.

Importing this package registers every table on ``Base.metadata``, which is
what Alembic autogenerate reads. Any new model must be imported here or
migrations will silently omit it.
"""

from api.db import Base
from api.models.claim import Claim
from api.models.device import DeviceToken
from api.models.enums import (
    EXPIRY_CHOICES,
    OPAQUE_EMAIL_DOMAINS,
    PLACEHOLDER_NAME,
    RESERVATION_MINUTES,
    ClaimStatus,
    ListingStatus,
    ReportReason,
    UserRole,
)
from api.models.listing import Listing, ListingPhoto
from api.models.moderation import Block, Report
from api.models.notification import Notification
from api.models.rating import Rating
from api.models.saved import SavedListing
from api.models.user import User

__all__ = [
    "EXPIRY_CHOICES",
    "OPAQUE_EMAIL_DOMAINS",
    "PLACEHOLDER_NAME",
    "RESERVATION_MINUTES",
    "Base",
    "Block",
    "Claim",
    "ClaimStatus",
    "DeviceToken",
    "Listing",
    "ListingPhoto",
    "ListingStatus",
    "Notification",
    "Rating",
    "Report",
    "ReportReason",
    "SavedListing",
    "User",
    "UserRole",
]
