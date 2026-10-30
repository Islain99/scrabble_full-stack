"""notifications push (jetons d'appareil) ; suppression de compte : salles en cascade

Revision ID: 0011_push_account
Revises: 0010_mp_ranking
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_push_account"
down_revision = "0010_mp_ranking"
branch_labels = None
depends_on = None


def _mp_foreign_keys(ondelete: str | None) -> None:
    """Clés étrangères hôte / invité des salles (noms par défaut de PostgreSQL)."""
    rule = f" ON DELETE {ondelete}" if ondelete else ""
    for column in ("host_user_id", "guest_user_id"):
        name = f"multiplayer_games_{column}_fkey"
        op.execute(f"ALTER TABLE multiplayer_games DROP CONSTRAINT IF EXISTS {name}")
        op.execute(f"ALTER TABLE multiplayer_games ADD CONSTRAINT {name} "
                   f"FOREIGN KEY ({column}) REFERENCES users (id){rule}")


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id",           sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id",      sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token",        sa.String(512), nullable=False, unique=True),
        sa.Column("platform",     sa.String(16), nullable=False, server_default="web"),
        sa.Column("locale",       sa.String(8), nullable=False, server_default="fr"),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])

    # Un compte supprimé emporte ses salles (le code les traite avant : abandon, annulation)
    _mp_foreign_keys("CASCADE")


def downgrade() -> None:
    _mp_foreign_keys(None)
    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_table("push_tokens")
