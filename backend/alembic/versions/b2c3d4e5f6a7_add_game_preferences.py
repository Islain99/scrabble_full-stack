"""add_game_preferences_to_users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-30

Ajoute la colonne game_preferences (JSON) sur la table users.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'   # ← adapte à ta dernière revision
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'game_preferences',
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
            comment='Préférences de jeu personnalisées (difficulty, turnDuration, etc.)'
        )
    )


def downgrade() -> None:
    op.drop_column('users', 'game_preferences')
