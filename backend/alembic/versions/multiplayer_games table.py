"""multiplayer_games table

Revision ID: 0004_multiplayer
Revises: 0003
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_multiplayer"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "multiplayer_games",
        sa.Column("id",             sa.Integer(),     primary_key=True, autoincrement=True),
        sa.Column("room_id",        sa.String(36),    nullable=False, unique=True, index=True),
        sa.Column("host_user_id",   sa.Integer(),     sa.ForeignKey("users.id"), nullable=False),
        sa.Column("guest_user_id",  sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status",         sa.String(16),    nullable=False, default="WAITING"),
        # État complet de la partie sérialisé en JSON
        sa.Column("game_state",     JSONB,            nullable=True),
        # Quel user_id doit jouer (redondant avec game_state mais pratique pour les requêtes)
        sa.Column("current_user_id", sa.Integer(),    nullable=True),
        sa.Column("winner_user_id",  sa.Integer(),    nullable=True),
        sa.Column("host_score",      sa.Integer(),    nullable=True),
        sa.Column("guest_score",     sa.Integer(),    nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("finished_at",    sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("multiplayer_games")