"""amis, demandes, groupes, blocages ; code ami des joueurs

Revision ID: 0007_friends
Revises: 0006_room_settings
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_friends"
down_revision = "0006_room_settings"
branch_labels = None
depends_on = None


# Lettres accentuées → lettres simples (Élodie → ELOD), comme app/friends/codes.py
_ACCENTED = "ÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÝÇÑàâäáãåéèêëíìîïóòôöõúùûüýÿçñ"
_PLAIN    = "AAAAAAEEEEIIIIOOOOOUUUUYCNaaaaaaeeeeiiiiooooouuuuyycn"


def upgrade() -> None:
    op.add_column("users", sa.Column("friend_code", sa.String(12), nullable=True))

    # Code ami pour chaque compte existant, en SQL pur : la migration doit aussi
    # fonctionner en mode hors ligne (alembic upgrade --sql, utilisé par la CI),
    # où aucune requête ne renvoie de résultat.
    # Préfixe : 4 premières lettres du pseudo (JOUE s'il en a moins de 2).
    # Nombre : id × 7919 modulo 10⁶ sur 6 chiffres. 7919 étant premier avec 10⁶,
    # deux comptes (id < 1 000 000) n'ont jamais le même nombre, donc jamais le
    # même code ; les nouveaux comptes reçoivent un code à 4 chiffres (codes.py),
    # qui ne peut pas coïncider avec ces codes à 6 chiffres.
    op.execute(
        f"""
        UPDATE users AS u
        SET friend_code =
            (CASE WHEN length(s.prefix) >= 2 THEN s.prefix ELSE 'JOUE' END)
            || '-' || lpad(((u.id::bigint * 7919) % 1000000)::text, 6, '0')
        FROM (
            SELECT id,
                   upper(left(regexp_replace(translate(display_name, '{_ACCENTED}', '{_PLAIN}'),
                                             '[^A-Za-z]', '', 'g'), 4)) AS prefix
            FROM users
        ) AS s
        WHERE s.id = u.id
        """
    )
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
