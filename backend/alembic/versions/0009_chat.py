"""messagerie : conversations, membres, messages, signalements ; admin et sourdine

Revision ID: 0009_chat
Revises: 0008_game_invitations
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_chat"
down_revision = "0008_game_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("chat_muted_until", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "conversations",
        sa.Column("id",              sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("kind",            sa.String(16), nullable=False),
        sa.Column("name",            sa.String(40), nullable=True),
        sa.Column("creator_id",      sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unique_key",      sa.String(64), nullable=True, unique=True),
        sa.Column("room_id",         sa.String(36), nullable=True),
        sa.Column("slow_mode_s",     sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_conversations_room_id", "conversations", ["room_id"])
    op.create_index("ix_conversations_last_message_at", "conversations", ["last_message_at"])

    op.create_table(
        "conversation_members",
        sa.Column("conversation_id", sa.Integer, sa.ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id",         sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role",            sa.String(16), nullable=False, server_default="member"),
        sa.Column("joined_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_read_id",    sa.Integer, nullable=False, server_default="0"),
        sa.Column("muted",           sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_conversation_members_user_id", "conversation_members", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id",              sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("conversation_id", sa.Integer, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id",       sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("body",            sa.Text, nullable=False),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by",      sa.Integer, nullable=True),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_author_id", "messages", ["author_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])

    op.create_table(
        "message_reports",
        sa.Column("id",          sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("message_id",  sa.Integer, sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reporter_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason",      sa.String(200), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Integer, nullable=True),
        sa.UniqueConstraint("message_id", "reporter_id", name="uq_message_reports_once"),
    )
    op.create_index("ix_message_reports_message_id", "message_reports", ["message_id"])

    # Le salon universel existe dès le départ (SQL pur : compatible alembic --sql)
    op.execute("INSERT INTO conversations (kind, name, unique_key, slow_mode_s) VALUES ('global', 'Universel', 'global', 0)")


def downgrade() -> None:
    op.drop_index("ix_message_reports_message_id", table_name="message_reports")
    op.drop_table("message_reports")
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_messages_author_id", table_name="messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversation_members_user_id", table_name="conversation_members")
    op.drop_table("conversation_members")
    op.drop_index("ix_conversations_last_message_at", table_name="conversations")
    op.drop_index("ix_conversations_room_id", table_name="conversations")
    op.drop_table("conversations")
    op.drop_column("users", "chat_muted_until")
    op.drop_column("users", "is_admin")
