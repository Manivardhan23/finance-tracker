"""add statement upload support

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    # source + nullable gmail_message_id are already included in the 0001
    # baseline CREATE TABLE, so nothing to do on a fresh database.
    pass


def downgrade():
    pass
