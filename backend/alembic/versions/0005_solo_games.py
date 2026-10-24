"""solo_games table — persistance des parties solo

Revision ID: 0005_solo_games
Revises: 0004_multiplayer
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005_solo_games"
down_revision = "0004_multiplayer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "solo_games",
        sa.Column("game_id",     sa.String(36), primary_key=True),
        sa.Column("difficulty",  sa.String(16), nullable=False),
        sa.Column("status",      sa.String(16), nullable=False),
        # État complet de la partie (GameState) sérialisé
        sa.Column("state",       JSONB,         nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_solo_games_status_updated", "solo_games", ["status", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_solo_games_status_updated", table_name="solo_games")
    op.drop_table("solo_games")
