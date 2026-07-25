"""add ratings

Revision ID: c8a4d5e6f7b2
Revises: b7f3c2a19d84
Create Date: 2026-07-26 11:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8a4d5e6f7b2"
down_revision: str | None = "b7f3c2a19d84"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ratings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("claim_id", sa.Uuid(), nullable=False),
        sa.Column("host_id", sa.String(length=128), nullable=False),
        sa.Column("recipient_id", sa.String(length=128), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("stars BETWEEN 1 AND 5", name="ck_ratings_stars_range"),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("claim_id", name="uq_rating_per_claim"),
    )
    op.create_index("ix_ratings_host", "ratings", ["host_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ratings_host", table_name="ratings")
    op.drop_table("ratings")
