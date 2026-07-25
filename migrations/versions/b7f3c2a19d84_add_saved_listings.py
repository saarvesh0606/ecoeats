"""add saved_listings

Revision ID: b7f3c2a19d84
Revises: 04dd91269988
Create Date: 2026-07-26 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7f3c2a19d84"
down_revision: str | None = "04dd91269988"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_listings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "listing_id", name="uq_saved_per_user"),
    )
    op.create_index(
        "ix_saved_user", "saved_listings", ["user_id", "created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_saved_user", table_name="saved_listings")
    op.drop_table("saved_listings")
