"""add notifications.kind so the client can pick an icon

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-21 21:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Non-null with a server default, so existing rows are filled in place and
    # the deploy needs no backfill step. "activity" is the generic bucket the
    # client already had an icon for, which is the honest value for a row
    # written before anything recorded what it was about.
    op.add_column(
        "notifications",
        sa.Column(
            "kind",
            sa.String(length=30),
            nullable=False,
            server_default="activity",
        ),
    )


def downgrade() -> None:
    op.drop_column("notifications", "kind")
