"""Shared enumerations.

Stored as VARCHAR + CHECK constraint rather than native PostgreSQL enums.
Native enums are painful to extend — adding a claim status would mean an
ALTER TYPE migration — and this vocabulary will grow.
"""

from enum import StrEnum


class UserRole(StrEnum):
    """Account type, chosen at signup and switchable from the profile.

    An organizer posts surplus food; a recipient claims it. The two get
    different interfaces.

    Not permanent, but not free either: a switch is refused while the account
    has food in flight, because the two roles are the two halves of a handover
    and dropping one mid-transaction strands the other. See
    POST /users/me/role.
    """

    ORGANIZER = "organizer"
    RECIPIENT = "recipient"


class ListingStatus(StrEnum):
    DRAFT = "draft"
    """Saved but not published. Hidden from the feed; the host can edit and
    publish it later."""

    SCHEDULED = "scheduled"
    """Published to go live at a set time. Hidden from the feed until then, when
    a sweep flips it to active."""

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
