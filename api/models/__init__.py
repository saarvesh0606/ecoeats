"""ORM models.

Importing this package registers every table on ``Base.metadata``, which is
what Alembic autogenerate reads. Any new model must be imported here or
migrations will silently omit it.
"""

from api.db import Base
from api.models.claim import Claim
from api.models.enums import (
    ALLOWED_EMAIL_DOMAIN,
    EXPIRY_CHOICES,
    RESERVATION_MINUTES,
    ClaimStatus,
    ListingStatus,
    UserRole,
)
from api.models.listing import Listing, ListingPhoto
from api.models.user import User

__all__ = [
    "ALLOWED_EMAIL_DOMAIN",
    "EXPIRY_CHOICES",
    "RESERVATION_MINUTES",
    "Base",
    "Claim",
    "ClaimStatus",
    "Listing",
    "ListingPhoto",
    "ListingStatus",
    "User",
    "UserRole",
]
