"""stop pinning accounts to one email domain

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-09-02 14:20:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop the asu.edu CHECK.

    EcoEats is open to any verified address until ASU approves the use of its
    name, and the restriction has to be able to come and go without a schema
    change — a CHECK constraint cannot follow a setting. The rule now lives in
    Settings.allowed_email_domain and is enforced during token verification.

    It also could not survive the two social sign-in buttons regardless: Apple
    issues @privaterelay.appleid.com addresses to anyone who hides their real
    one, and a Google account sits on whatever domain its owner actually has.
    """
    # IF EXISTS, not op.drop_constraint: this runs at container start, ahead of
    # uvicorn, under `set -e` (scripts/start.sh). A migration that raises means
    # the API does not boot at all — so a constraint that is already gone, on a
    # database built after this point or partially migrated by hand, must be a
    # no-op rather than an outage.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_asu_email")


def downgrade() -> None:
    """Restore the constraint.

    ⚠ This fails if any row holds a non-asu.edu address, which after any real
    use of the open app it will. That is deliberate: silently deleting people's
    accounts to make a downgrade succeed would be far worse than refusing.
    Remove or migrate those rows first if you genuinely mean to go back.
    """
    op.create_check_constraint(
        "ck_users_asu_email", "users", "email LIKE '%%@asu.edu'"
    )
