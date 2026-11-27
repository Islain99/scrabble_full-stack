"""dashboard admin : publications (annonces)

Revision ID: 0016_announcements
Revises: 0015_economy
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016_announcements"
down_revision = "0015_economy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title_fr", sa.String(120), nullable=False),
        sa.Column("title_en", sa.String(120), nullable=False),
        sa.Column("body_fr", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_en", sa.Text(), nullable=False, server_default=""),
        sa.Column("kind", sa.String(16), nullable=False, server_default="info"),
        sa.Column("link", sa.String(300), nullable=True),
        sa.Column("audience_tiers", postgresql.JSONB(), nullable=True),
        sa.Column("show_banner", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notify", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_announcements_status_starts", "announcements", ["status", "starts_at"])


def downgrade() -> None:
    op.drop_index("ix_announcements_status_starts", table_name="announcements")
    op.drop_table("announcements")
