"""record which roles a user accepted the terms as

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-22 18:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "terms_accepted_roles",
            postgresql.ARRAY(sa.String(length=20)),
            nullable=False,
            server_default="{}",
        ),
    )

    # Anyone who has already accepted did so as the role they hold now — that is
    # the document they were shown. Backfilling it keeps existing users out of a
    # prompt they have already answered, while still asking them the first time
    # they switch to the other side.
    op.execute(
        """
        UPDATE users
           SET terms_accepted_roles = ARRAY[role::text]
         WHERE terms_version IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("users", "terms_accepted_roles")
