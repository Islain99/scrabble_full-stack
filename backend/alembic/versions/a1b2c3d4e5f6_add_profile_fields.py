"""add_profile_fields

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-05-25

Ajoute les colonnes : first_name, last_name, age, country, profile_complete
sur la table users.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = None   # ← Remplace par l'ID de ta dernière migration si elle existe
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('first_name', sa.String(64), nullable=True))
    op.add_column('users', sa.Column('last_name',  sa.String(64), nullable=True))
    op.add_column('users', sa.Column('age',        sa.SmallInteger(), nullable=True))
    op.add_column('users', sa.Column('country',    sa.String(100), nullable=True))
    op.add_column('users', sa.Column('profile_complete', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'profile_complete')
    op.drop_column('users', 'country')
    op.drop_column('users', 'age')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
