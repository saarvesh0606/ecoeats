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


class ReportReason(StrEnum):
    """Why something was reported.

    A fixed vocabulary rather than free text alone, so reports can be triaged
    by severity without reading every one. ``detail`` carries the words.
    """

    UNSAFE_FOOD = "unsafe_food"
    """Food that looks unsafe to eat, or wrongly described allergens. Read
    these first — this is the one that can hurt somebody."""

    OFFENSIVE = "offensive"
    """Abusive, obscene, hateful or threatening content."""

    HARASSMENT = "harassment"
    """Directed at a person rather than posted at large."""

    MISLEADING = "misleading"
    """Food that is not there, not surplus, or not the poster's to give."""

    SPAM = "spam"
    """Advertising, selling, or repetition."""

    OTHER = "other"
    """Anything the list above does not cover. ``detail`` is required."""


#: Expiry windows an organizer may choose, in minutes. Fixed by the product
#: spec — not a free-form integer as it was in v1.
EXPIRY_CHOICES: tuple[int, ...] = (15, 20, 30, 45, 60)

#: How long a claimed portion stays reserved before it returns to the pool.
RESERVATION_MINUTES = 20

#: Domains whose local part is machine-generated and means nothing to a human.
#: Sign in with Apple's "Hide My Email" issues addresses like
#: ``x7k2m9p4qr@privaterelay.appleid.com`` — deriving a display name from that
#: produces a string of random letters, which is exactly what it looks like.
OPAQUE_EMAIL_DOMAINS = frozenset({"privaterelay.appleid.com"})

#: Shown when nothing better is known. Deliberately obviously-a-placeholder, so
#: it reads as "not set yet" and invites an edit, rather than as a name someone
#: chose. The Profile screen can change it.
PLACEHOLDER_NAME = "New member"


def display_name_from_email(email: str) -> str | None:
    """A human-ish name from an address, or None when the address has none.

    The local part is a reasonable guess for a real mailbox (``mkumar17``) and
    worthless for a relay (``x7k2m9p4qr``). Returning None rather than the
    gibberish lets the caller fall back to something honest.
    """
    local, _, domain = email.partition("@")
    if domain.lower() in OPAQUE_EMAIL_DOMAINS:
        return None
    return local or None
