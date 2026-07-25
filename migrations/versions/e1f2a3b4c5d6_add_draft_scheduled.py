"""add draft/scheduled statuses and scheduled_for

Revision ID: e1f2a3b4c5d6
Revises: d9e5f6a7b8c3
Create Date: 2026-07-26 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d9e5f6a7b8c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD = "status IN ('active', 'claimed', 'expired', 'cancelled')"
_NEW = (
    "status IN ('active', 'claimed', 'expired', 'cancelled', 'draft', 'scheduled')"
)


def upgrade() -> None:
    op.add_column(
        "listings",
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_constraint("listingstatus", "listings", type_="check")
    op.create_check_constraint("listingstatus", "listings", _NEW)


def downgrade() -> None:
    op.drop_constraint("listingstatus", "listings", type_="check")
    op.create_check_constraint("listingstatus", "listings", _OLD)
    op.drop_column("listings", "scheduled_for")
