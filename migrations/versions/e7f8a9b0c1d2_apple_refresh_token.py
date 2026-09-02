"""keep Apple's refresh token so a deletion can revoke it

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-09-02 19:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Nullable, because almost nobody has one.

    It is only set for accounts that signed in with Apple, and only so the
    authorisation can be withdrawn when the account is deleted — Apple requires
    that of any app offering deletion.
    """
    op.add_column(
        "users",
        sa.Column("apple_refresh_token", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "apple_refresh_token")
