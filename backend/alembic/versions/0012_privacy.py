"""confidentialité : chaque joueur choisit qui voit son profil, ses statistiques, sa présence

Revision ID: 0012_privacy
Revises: 0011_push_account
Create Date: 2026-10-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_privacy"
down_revision = "0011_push_account"
branch_labels = None
depends_on = None

# Valeurs par défaut = comportement d'avant (rien ne change pour les joueurs existants)
COLUMNS = (
    ("privacy_profile",  sa.String(16), "everyone"),
    ("privacy_stats",    sa.String(16), "everyone"),
    ("privacy_presence", sa.String(16), "friends"),
    ("privacy_requests", sa.String(16), "everyone"),
    ("privacy_search",      sa.Boolean, sa.true()),
    ("privacy_leaderboard", sa.Boolean, sa.true()),
)


def upgrade() -> None:
    for name, type_, default in COLUMNS:
        op.add_column("users", sa.Column(name, type_, nullable=False, server_default=default))
    # Le profil était déclaré complet par personne : on le recalcule (pseudo, prénom, nom, âge, pays)
    op.execute("""
        UPDATE users SET profile_complete = (
            coalesce(display_name, '') <> '' AND coalesce(first_name, '') <> ''
            AND coalesce(last_name, '') <> '' AND age IS NOT NULL AND coalesce(country, '') <> ''
        )
    """)


def downgrade() -> None:
    for name, _, _ in reversed(COLUMNS):
        op.drop_column("users", name)
