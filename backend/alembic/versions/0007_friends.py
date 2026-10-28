"""amis, demandes, groupes, blocages ; code ami des joueurs

Revision ID: 0007_friends
Revises: 0006_room_settings
Create Date: 2026-10-28
"""
import re
import secrets
import unicodedata

from alembic import op
import sqlalchemy as sa

revision = "0007_friends"
down_revision = "0006_room_settings"
branch_labels = None
depends_on = None


def _prefix(name: str) -> str:
    # Même règle que app/friends/codes.py (copiée : une migration ne dépend pas du code applicatif)
    ascii_name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    letters = re.sub(r"[^A-Za-z]", "", ascii_name).upper()[:4]
    return letters if len(letters) >= 2 else "JOUE"


def upgrade() -> None:
    op.add_column("users", sa.Column("friend_code", sa.String(12), nullable=True))

    # Code ami pour chaque compte existant
    conn = op.get_bind()
    taken = set()
    for user_id, name in conn.execute(sa.text("SELECT id, display_name FROM users ORDER BY id")).all():
        for attempt in range(50):
            digits = 4 if attempt < 30 else 6
            code = f"{_prefix(name)}-{secrets.randbelow(10 ** digits):0{digits}d}"
            if code not in taken:
                break
        taken.add(code)
        conn.execute(sa.text("UPDATE users SET friend_code = :c WHERE id = :i"), {"c": code, "i": user_id})
    op.create_index("ix_users_friend_code", "users", ["friend_code"], unique=True)

    op.create_table(
        "friendships",
        sa.Column("id",           sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("requester_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("addressee_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_low",     sa.Integer, nullable=False),
        sa.Column("user_high",    sa.Integer, nullable=False),
        sa.Column("status",       sa.String(16), nullable=False),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_low", "user_high", name="uq_friendships_pair"),
    )
    op.create_index("ix_friendships_requester_id", "friendships", ["requester_id"])
    op.create_index("ix_friendships_addressee_id", "friendships", ["addressee_id"])

    op.create_table(
        "friend_groups",
        sa.Column("id",         sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("owner_id",   sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name",       sa.String(30), nullable=False),
        sa.Column("color",      sa.String(16), nullable=False, server_default="olive"),
        sa.Column("position",   sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_friend_groups_owner_id", "friend_groups", ["owner_id"])

    op.create_table(
        "friend_group_members",
        sa.Column("group_id",  sa.Integer, sa.ForeignKey("friend_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("friend_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "user_blocks",
        sa.Column("blocker_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blocked_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("user_blocks")
    op.drop_table("friend_group_members")
    op.drop_index("ix_friend_groups_owner_id", table_name="friend_groups")
    op.drop_table("friend_groups")
    op.drop_index("ix_friendships_addressee_id", table_name="friendships")
    op.drop_index("ix_friendships_requester_id", table_name="friendships")
    op.drop_table("friendships")
    op.drop_index("ix_users_friend_code", table_name="users")
    op.drop_column("users", "friend_code")
