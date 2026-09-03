"""add blocks and reports

Blocking and reporting, required of any app carrying user-generated content
(App Store Guideline 1.2).

Note the asymmetry in delete behaviour, which is deliberate. A block cascades:
once either account is gone the pair is meaningless. A report does not — every
foreign key is SET NULL, because a report has to outlive both the listing it
concerns (they expire within the hour) and the account behind it (the worst
reports are the ones followed by the offender deleting their account). The
listing title is copied onto the row for the same reason.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-09-03 18:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REASONS = (
    "unsafe_food",
    "offensive",
    "harassment",
    "misleading",
    "spam",
    "other",
)


def upgrade() -> None:
    op.create_table(
        "blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("blocker_id", sa.String(length=128), nullable=False),
        sa.Column("blocked_id", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),
        sa.CheckConstraint("blocker_id <> blocked_id", name="ck_blocks_not_self"),
    )
    op.create_index(
        "ix_blocks_blocker", "blocks", ["blocker_id", "created_at"], unique=False
    )
    # The feed checks both directions on every request; the pair constraint
    # only serves the blocker side.
    op.create_index("ix_blocks_blocked", "blocks", ["blocked_id"], unique=False)

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.String(length=128), nullable=True),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column("reported_user_id", sa.String(length=128), nullable=True),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("listing_title", sa.String(length=200), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["reported_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "reason IN (" + ", ".join(f"'{r}'" for r in REASONS) + ")",
            name="ck_reports_reason",
        ),
        sa.CheckConstraint(
            "listing_id IS NOT NULL OR reported_user_id IS NOT NULL",
            name="ck_reports_has_subject",
        ),
    )
    op.create_index(
        "ix_reports_open", "reports", ["resolved_at", "created_at"], unique=False
    )
    op.create_index("ix_reports_reporter", "reports", ["reporter_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reports_reporter", table_name="reports")
    op.drop_index("ix_reports_open", table_name="reports")
    op.drop_table("reports")
    op.drop_index("ix_blocks_blocked", table_name="blocks")
    op.drop_index("ix_blocks_blocker", table_name="blocks")
    op.drop_table("blocks")
