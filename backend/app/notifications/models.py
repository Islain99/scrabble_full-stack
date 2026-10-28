# app/notifications/models.py
#
# Invitations à jouer (lot 5) : un joueur invite un ami dans sa salle en attente.
# L'invitation vit tant que la salle attend : elle expire dès que la salle
# démarre avec quelqu'un d'autre, est annulée ou nettoyée.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InvitationStatus:
    PENDING   = "pending"
    ACCEPTED  = "accepted"
    DECLINED  = "declined"
    EXPIRED   = "expired"      # salle partie, annulée ou nettoyée


class GameInvitation(Base):
    __tablename__ = "game_invitations"
    __table_args__ = (Index("ix_game_invitations_invitee_status", "invitee_id", "status"),)

    id:           Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id:      Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    inviter_id:   Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invitee_id:   Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status:       Mapped[str] = mapped_column(String(16), nullable=False, default=InvitationStatus.PENDING)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
