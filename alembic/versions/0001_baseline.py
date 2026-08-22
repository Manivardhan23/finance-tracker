"""baseline - create all tables from scratch

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
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("username", sa.String(), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(), unique=True, index=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "category_rules",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("keyword", sa.String(), nullable=False, index=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "app_config",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("merchant", sa.String(), index=True),
        sa.Column("transaction_type", sa.String(), index=True),
        sa.Column("category", sa.String(), index=True, server_default="Uncategorized"),
        sa.Column("date", sa.Date(), nullable=False, index=True),
        sa.Column("raw_email_snippet", sa.String()),
        sa.Column("gmail_message_id", sa.String(), unique=True, index=True, nullable=True),
        sa.Column("source", sa.String(), server_default="email"),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("transactions")
    op.drop_table("app_config")
    op.drop_table("category_rules")
    op.drop_table("categories")
    op.drop_table("users")
