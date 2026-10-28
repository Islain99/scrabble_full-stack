# app/chat/models.py
#
# Messagerie (lot 6).
#
#   conversations        : privée (2 amis), groupe (3 à 20, avec un nom), universelle
#                          (une seule, ouverte à tous), partie (les 2 joueurs d'une salle).
#                          `kind` est un texte libre : une conversation d'alliance
#                          ('alliance') s'ajoutera sans migration de structure.
#   conversation_members : qui en fait partie, son rôle, son dernier message lu, sourdine.
#                          La conversation universelle n'a pas de membres : tout joueur connecté y lit.
#   messages             : 500 caractères au plus ; supprimés « en douceur » (deleted_at).
#   message_reports      : signalements, traités par un administrateur.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConversationKind:
    PRIVATE = "private"
    GROUP   = "group"
    GLOBAL  = "global"
    GAME    = "game"


class Conversation(Base):
    __tablename__ = "conversations"

    id:              Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind:            Mapped[str] = mapped_column(String(16), nullable=False)
    name:            Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    creator_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Unicité : « private:3:8 » (une seule conversation par paire), « global », « game:ABC234 »
    unique_key:      Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    room_id:         Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    # Salon universel : délai minimal entre deux messages d'un même joueur (mode lent)
    slow_mode_s:     Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id:         Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role:            Mapped[str] = mapped_column(String(16), nullable=False, default="member")   # owner | member
    joined_at:       Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_read_id:    Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    muted:           Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Message(Base):
    __tablename__ = "messages"

    id:              Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    body:            Mapped[str] = mapped_column(Text, nullable=False)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    deleted_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by:      Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class MessageReport(Base):
    __tablename__ = "message_reports"
    __table_args__ = (UniqueConstraint("message_id", "reporter_id", name="uq_message_reports_once"),)

    id:          Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id:  Mapped[int] = mapped_column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason:      Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
