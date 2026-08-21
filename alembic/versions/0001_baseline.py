"""baseline - represents the existing schema before Alembic was introduced

Revision ID: 0001
Revises:
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # No-op: your tracker.db already has this schema (created via
    # Base.metadata.create_all). This migration exists purely as a
    # starting point so Alembic has a known baseline to build on.
    pass


def downgrade():
    pass
