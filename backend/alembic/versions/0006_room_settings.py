"""multiplayer_games : règles de salle et minuteur

Revision ID: 0006_room_settings
Revises: 0005_solo_games
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006_room_settings"
down_revision = "0005_solo_games"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Règles choisies par l'hôte (NULL pour les salles existantes → valeurs par défaut)
    op.add_column("multiplayer_games", sa.Column("settings", JSONB, nullable=True))
    # Minuteur : fin du tour en cours, lue toutes les quelques secondes par le serveur
    op.add_column("multiplayer_games", sa.Column("turn_deadline", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_multiplayer_games_turn_deadline", "multiplayer_games", ["turn_deadline"])


def downgrade() -> None:
    op.drop_index("ix_multiplayer_games_turn_deadline", table_name="multiplayer_games")
    op.drop_column("multiplayer_games", "turn_deadline")
    op.drop_column("multiplayer_games", "settings")
