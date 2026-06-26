# app/multiplayer/models.py
#
# Modèle SQLAlchemy pour la table `multiplayer_games`
# + schémas Pydantic (request/response) utilisés par le router.
#
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


# ── Statuts possibles ─────────────────────────────────────────────

class RoomStatus(str, enum.Enum):
    WAITING  = "WAITING"   # hôte a créé, attend un second joueur
    ACTIVE   = "ACTIVE"    # 2 joueurs, partie en cours
    FINISHED = "FINISHED"  # partie terminée


# ── Modèle SQLAlchemy ──────────────────────────────────────────────

class MultiplayerGame(Base):
    __tablename__ = "multiplayer_games"

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id:         Mapped[str]           = mapped_column(String(36), unique=True, nullable=False, index=True)
    host_user_id:    Mapped[int]           = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    guest_user_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    status:          Mapped[str]           = mapped_column(String(16), nullable=False, default=RoomStatus.WAITING)

    # État complet sérialisé (GameState Pydantic → dict JSON)
    game_state:      Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Dénormalisations pratiques
    current_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    winner_user_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    host_score:      Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    guest_score:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finished_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relations (lazy pour ne pas alourdir les requêtes)
    host  = relationship("User", foreign_keys=[host_user_id],  lazy="select")
    guest = relationship("User", foreign_keys=[guest_user_id], lazy="select")


# ── Schémas Pydantic ──────────────────────────────────────────────

class CreateRoomResponse(BaseModel):
    room_id:    str
    status:     str
    host_name:  str

    class Config:
        from_attributes = True


class RoomStateResponse(BaseModel):
    """
    Réponse renvoyée après chaque action (join, move, pass, swap).
    Le frontend met à jour son gameState local avec `game_state`.
    """
    room_id:         str
    status:          str
    current_user_id: Optional[int]
    winner_user_id:  Optional[int]
    host_score:      Optional[int]
    guest_score:     Optional[int]
    game_state:      Optional[dict[str, Any]]

    class Config:
        from_attributes = True


class PlayMoveRequest(BaseModel):
    """Corps de POST /multiplayer/{room_id}/move"""
    placements: list[dict[str, Any]]
    # Chaque élément : { "r": int, "c": int, "letter": str }


class SwapRequest(BaseModel):
    """Corps de POST /multiplayer/{room_id}/swap"""
    letters: list[str]