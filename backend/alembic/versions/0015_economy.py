"""dashboard admin : abonnements et crédits

Revision ID: 0015_economy
Revises: 0014_app_config
Create Date: 2026-11-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_economy"
down_revision = "0014_app_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscription_tiers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(32), nullable=False, unique=True),
        sa.Column("name_fr", sa.String(40), nullable=False),
        sa.Column("name_en", sa.String(40), nullable=False),
        sa.Column("description_fr", sa.String(300), nullable=False, server_default=""),
        sa.Column("description_en", sa.String(300), nullable=False, server_default=""),
        sa.Column("color", sa.String(7), nullable=False, server_default="#8a7a5c"),
        sa.Column("badge", sa.String(8), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Niveau de départ : « Gratuit », sans badge (personne ne le voit à côté de son pseudo)
    op.execute(
        "INSERT INTO subscription_tiers (slug, name_fr, name_en, description_fr, description_en, color, badge, sort_order, is_default) "
        "VALUES ('gratuit', 'Gratuit', 'Free', 'Le jeu complet, sans abonnement.', 'The full game, no subscription.', "
        "'#8a7a5c', '', 0, true)"
    )

    op.add_column("users", sa.Column("tier_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_users_tier_id", "users", "subscription_tiers", ["tier_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_users_tier_id", "users", ["tier_id"])
    op.add_column("users", sa.Column("tier_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("credits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("last_daily_credit_on", sa.String(10), nullable=True))

    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("ref", sa.String(80), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("admin_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "kind", "ref", name="uq_credit_tx_user_kind_ref"),
    )
    op.create_index("ix_credit_tx_user_id_id", "credit_transactions", ["user_id", "id"])
    op.create_index("ix_credit_transactions_created_at", "credit_transactions", ["created_at"])

    op.create_table(
        "user_unlocks",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("item_type", sa.String(16), primary_key=True),
        sa.Column("item_key", sa.String(32), primary_key=True),
        sa.Column("via", sa.String(16), nullable=False, server_default="purchase"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("user_unlocks")
    op.drop_index("ix_credit_transactions_created_at", table_name="credit_transactions")
    op.drop_index("ix_credit_tx_user_id_id", table_name="credit_transactions")
    op.drop_table("credit_transactions")
    op.drop_column("users", "last_daily_credit_on")
    op.drop_column("users", "credits")
    op.drop_column("users", "tier_expires_at")
    op.drop_index("ix_users_tier_id", table_name="users")
    op.drop_constraint("fk_users_tier_id", "users", type_="foreignkey")
    op.drop_column("users", "tier_id")
    op.drop_table("subscription_tiers")
