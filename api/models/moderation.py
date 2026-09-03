"""Blocking and reporting — the two things a platform carrying other people's
content has to offer, and the two App Store asks for by name (Guideline 1.2).

Both are deliberately one-sided records rather than state on the user row. A
block is a fact about a pair, and a report is a fact about a moment: neither
belongs as a column that the next feature would have to keep in step.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base
from api.models.enums import ReportReason


class Block(Base):
    """One user choosing not to see another.

    Symmetric in effect, one-sided in the record: blocking hides their food
    from you *and* yours from them, because a block that only worked in one
    direction would leave the person you blocked still able to claim your food
    and turn up to collect it. That is the outcome blocking exists to prevent,
    so the feed filters on either direction of this row.
    """

    __tablename__ = "blocks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    blocker_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # Blocking twice is a no-op, not a second row.
        UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),
        # Blocking yourself would filter your own listings out of your own
        # feed, which reads as the app losing them.
        CheckConstraint("blocker_id <> blocked_id", name="ck_blocks_not_self"),
        Index("ix_blocks_blocker", "blocker_id", "created_at"),
        # The feed checks both directions on every request, so both need an
        # index — the reverse lookup is not served by the pair constraint.
        Index("ix_blocks_blocked", "blocked_id"),
    )

    def __repr__(self) -> str:
        return f"<Block blocker={self.blocker_id} blocked={self.blocked_id}>"


class Report(Base):
    """A complaint about a listing or a person, kept for a human to read.

    Every foreign key here is ``SET NULL`` on delete, and that is the point: a
    report has to outlive the thing it is about. Listings expire within the
    hour and accounts can be deleted, so cascading would erase the evidence
    exactly when somebody had reported it — and the worst reports are the ones
    most likely to be followed by the offender deleting their account.

    ``reported_at`` is therefore paired with denormalised text: whatever the
    listing said at the time is captured on the row, because the listing itself
    will very likely be gone before anyone reads this.
    """

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    reporter_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL"), nullable=True
    )
    reported_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: What the listing said when it was reported. The listing will usually be
    #: expired or gone by the time a human looks.
    listing_title: Mapped[str | None] = mapped_column(String(200), nullable=True)

    #: Set once somebody has dealt with it, so an unread queue is a query
    #: rather than a spreadsheet kept alongside.
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "reason IN ("
            + ", ".join(f"'{r.value}'" for r in ReportReason)
            + ")",
            name="ck_reports_reason",
        ),
        # Something has to be under complaint, or the row says nothing.
        CheckConstraint(
            "listing_id IS NOT NULL OR reported_user_id IS NOT NULL",
            name="ck_reports_has_subject",
        ),
        # The moderation queue: unresolved first, newest first.
        Index("ix_reports_open", "resolved_at", "created_at"),
        # One person spamming reports is itself a pattern worth seeing.
        Index("ix_reports_reporter", "reporter_id"),
    )

    def __repr__(self) -> str:
        return f"<Report {self.reason} listing={self.listing_id}>"
