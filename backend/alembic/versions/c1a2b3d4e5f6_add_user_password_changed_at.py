"""add user password_changed_at (invalidate sessions on password reset)

Revision ID: c1a2b3d4e5f6
Revises: 42646f566390
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '42646f566390'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable: existing rows have never changed their password under the new
    # session-invalidation rule, so NULL correctly means "no cutoff" and all
    # currently-valid tokens keep working until a reset stamps this column.
    op.add_column(
        'users',
        sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'password_changed_at')
