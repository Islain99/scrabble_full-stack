"""invitations à jouer entre amis

Revision ID: 0008_game_invitations
Revises: 0007_friends
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_game_invitations"
down_revision = "0007_friends"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_invitations",
        sa.Column("id",           sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("room_id",      sa.String(36), nullable=False),
        sa.Column("inviter_id",   sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitee_id",   sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status",       sa.String(16), nullable=False),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_game_invitations_room_id", "game_invitations", ["room_id"])
    op.create_index("ix_game_invitations_inviter_id", "game_invitations", ["inviter_id"])
    op.create_index("ix_game_invitations_invitee_status", "game_invitations", ["invitee_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_game_invitations_invitee_status", table_name="game_invitations")
    op.drop_index("ix_game_invitations_inviter_id", table_name="game_invitations")
    op.drop_index("ix_game_invitations_room_id", table_name="game_invitations")
    op.drop_table("game_invitations")
