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
    with op.batch_alter_table("transactions") as batch_op:
        # Statement-uploaded transactions have no Gmail message id
        batch_op.alter_column(
            "gmail_message_id",
            existing_type=sa.String(),
            nullable=True,
        )
        batch_op.add_column(
            sa.Column("source", sa.String(), nullable=False, server_default="email")
        )


def downgrade():
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("source")
        batch_op.alter_column(
            "gmail_message_id",
            existing_type=sa.String(),
            nullable=False,
        )
