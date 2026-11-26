"""dashboard admin : journal des actions des administrateurs

Revision ID: 0013_admin_actions
Revises: 0012_privacy
Create Date: 2026-11-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_admin_actions"
down_revision = "0012_privacy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_admin_actions_admin_id", "admin_actions", ["admin_id"])
    op.create_index("ix_admin_actions_created_at", "admin_actions", ["created_at"])
    op.create_index("ix_admin_actions_target", "admin_actions", ["target_type", "target_id"])
    # Les statistiques du dashboard filtrent par date d'inscription et de connexion
    op.create_index("ix_users_created_at", "users", ["created_at"])
    op.create_index("ix_users_last_login_at", "users", ["last_login_at"])


def downgrade() -> None:
    op.drop_index("ix_users_last_login_at", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_admin_actions_target", table_name="admin_actions")
    op.drop_index("ix_admin_actions_created_at", table_name="admin_actions")
    op.drop_index("ix_admin_actions_admin_id", table_name="admin_actions")
    op.drop_table("admin_actions")
