"""record which terms each user accepted, and when

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-21 23:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "a3b4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable, with no default and no backfill on purpose: a null means this
    # person has genuinely never accepted anything, and every existing account
    # is in exactly that position. Filling it in would fabricate consent.
    op.add_column(
        "users",
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("terms_version", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
