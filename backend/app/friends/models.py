# app/friends/models.py
#
# Amis, demandes d'ami, groupes personnels et blocages (lot 4).
#
#   friendships          : une seule ligne par paire de joueurs (user_low, user_high),
#                          statut pending → accepted, ou declined (le demandeur n'en
#                          sait rien : sa demande lui paraît toujours en attente)
#   friend_groups        : groupes privés pour ranger ses amis (l'ami n'en sait rien)
#   friend_group_members : un ami peut être dans plusieurs groupes
#   user_blocks          : un joueur bloqué ne peut plus écrire, inviter ni demander
#
# Les lignes disparaissent avec le compte (ON DELETE CASCADE).
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FriendshipStatus:
    PENDING  = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_low", "user_high", name="uq_friendships_pair"),)

    id:           Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    requester_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    addressee_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Paire ordonnée (plus petit id, plus grand id) : une seule ligne par paire
    user_low:     Mapped[int] = mapped_column(Integer, nullable=False)
    user_high:    Mapped[int] = mapped_column(Integer, nullable=False)
    status:       Mapped[str] = mapped_column(String(16), nullable=False, default=FriendshipStatus.PENDING)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def other(self, user_id: int) -> int:
        return self.addressee_id if user_id == self.requester_id else self.requester_id


class FriendGroup(Base):
    __tablename__ = "friend_groups"

    id:         Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id:   Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name:       Mapped[str] = mapped_column(String(30), nullable=False)
    color:      Mapped[str] = mapped_column(String(16), nullable=False, default="olive")
    position:   Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class FriendGroupMember(Base):
    __tablename__ = "friend_group_members"

    group_id:  Mapped[int] = mapped_column(Integer, ForeignKey("friend_groups.id", ondelete="CASCADE"), primary_key=True)
    friend_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class UserBlock(Base):
    __tablename__ = "user_blocks"

    blocker_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
