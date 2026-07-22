"""Shared enumerations.

Stored as VARCHAR + CHECK constraint rather than native PostgreSQL enums.
Native enums are painful to extend — adding a claim status would mean an
ALTER TYPE migration — and this vocabulary will grow.
"""

from enum import StrEnum


class UserRole(StrEnum):
    """Permanent account type, chosen at signup.

    An organizer posts surplus food; a recipient claims it. The two get
    different interfaces.
    """

    ORGANIZER = "organizer"
    RECIPIENT = "recipient"


class ListingStatus(StrEnum):
    ACTIVE = "active"
    """Visible in the feed and claimable."""

    CLAIMED = "claimed"
    """Every portion is spoken for. Also what "out of stock" sets."""

    EXPIRED = "expired"
    """Passed its expiry window. Hidden, not claimable."""

    CANCELLED = "cancelled"
    """Withdrawn by the organizer."""


class ClaimStatus(StrEnum):
    PENDING = "pending"
    """Reserved, awaiting pickup. The only status holding inventory."""

    PICKED_UP = "picked_up"
    """Collected. Terminal."""

    NO_SHOW = "no_show"
    """Reservation lapsed or the organizer marked it. Terminal."""

    CANCELLED = "cancelled"
    """Recipient released it themselves. Terminal."""


#: Expiry windows an organizer may choose, in minutes. Fixed by the product
#: spec — not a free-form integer as it was in v1.
EXPIRY_CHOICES: tuple[int, ...] = (15, 20, 30, 45, 60)

#: How long a claimed portion stays reserved before it returns to the pool.
RESERVATION_MINUTES = 20

#: Only ASU addresses may hold an account.
ALLOWED_EMAIL_DOMAIN = "asu.edu"
