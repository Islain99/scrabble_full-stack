# app/multiplayer/models.py
#
# Modèle SQLAlchemy pour la table `multiplayer_games`
# + schémas Pydantic (request/response) utilisés par le router.
#
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
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
    host_user_id:    Mapped[int]           = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    guest_user_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)

    status:          Mapped[str]           = mapped_column(String(16), nullable=False, default=RoomStatus.WAITING)

    # État complet sérialisé (GameState Pydantic → dict JSON)
    # JSONB sous PostgreSQL, JSON ailleurs (tests en SQLite)
    game_state:      Mapped[Optional[dict]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    # Dénormalisations pratiques
    current_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    winner_user_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    host_score:      Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    guest_score:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finished_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Règles choisies par l'hôte (RoomSettings) ; NULL = salle d'avant la 0006 → défauts
    settings:        Mapped[Optional[dict]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    # Minuteur : fin du tour en cours (NULL sans minuteur ou hors partie en cours)
    turn_deadline:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Relations (lazy pour ne pas alourdir les requêtes)
    host  = relationship("User", foreign_keys=[host_user_id],  lazy="select")
    guest = relationship("User", foreign_keys=[guest_user_id], lazy="select")


# ── Schémas Pydantic ──────────────────────────────────────────────

TURN_SECONDS = (0, 30, 60, 120, 180, 300)


class RoomSettings(BaseModel):
    """
    Règles d'une salle, choisies par l'hôte à la création et figées ensuite.
    Les valeurs hors liste sont refusées (422) ; une salle sans réglages
    (créée avant la migration 0006) prend ces défauts.
    """
    name:         Optional[str] = None                       # None → « Partie de {hôte} » (client)
    # private : code ou lien ; public : salons publics (lot 3) ; friends : amis de l'hôte seulement (lot 4)
    visibility:   Literal["private", "public", "friends"] = "private"
    turn_seconds: Literal[0, 30, 60, 120, 180, 300] = 0       # 0 = sans minuteur ; dépassement = passe
    allow_swap:   bool = True                                # échanges de lettres
    show_preview: bool = True                                # aperçu du score avant validation (client)
    max_passes:   Literal[4, 6] = 6                          # fin après N passes successives
    target_score: Optional[Literal[150, 250, 400]] = None    # fin dès qu'un joueur l'atteint

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        # Espaces superflus et caractères de contrôle retirés
        cleaned = " ".join("".join(ch for ch in value if ch.isprintable()).split())
        if len(cleaned) > 40:
            raise ValueError("Le nom de la salle compte 40 caractères au plus.")
        return cleaned or None


class CreateRoomRequest(BaseModel):
    """Corps (facultatif) de POST /multiplayer/rooms"""
    settings: RoomSettings = RoomSettings()


class RoomPreviewResponse(BaseModel):
    """Ce que voit un joueur avant de rejoindre : règles, hôte, état de la salle."""
    room_id:   str
    status:    str
    host_name: str
    settings:  RoomSettings
    can_join:  bool
    # Pourquoi on ne peut pas rejoindre : started (déjà commencée), own (sa propre
    # salle), friends_only (réservée aux amis de l'hôte)
    reason:    Optional[str] = None

class PublicRoom(BaseModel):
    """Salle publique en attente d'un adversaire (salons publics, lot 3)."""
    room_id:    str
    host_name:  str
    settings:   RoomSettings
    created_at: Optional[datetime] = None
    is_mine:    bool = False


class CreateRoomResponse(BaseModel):
    room_id:    str
    status:     str
    host_name:  str
    settings:   Optional[RoomSettings] = None

    class Config:
        from_attributes = True


class RoomStateResponse(BaseModel):
    """
    Réponse renvoyée après chaque action (join, move, pass, swap).
    Le frontend met à jour son gameState local avec `game_state`.
    """
    room_id:         str
    status:          str
    host_user_id:    Optional[int] = None
    guest_user_id:   Optional[int] = None
    current_user_id: Optional[int]
    winner_user_id:  Optional[int]
    host_score:      Optional[int]
    guest_score:     Optional[int]
    game_state:      Optional[dict[str, Any]]
    # Dernière action jouée (ISO 8601, UTC) : sert au délai d'inactivité
    last_action_at:  Optional[datetime] = None
    # Délai (s) après lequel l'adversaire du joueur inactif peut réclamer la victoire
    claim_after_s:   int = 0
    # Règles de la salle, fin du tour (minuteur) et heure du serveur : le client
    # calcule le compte à rebours sans dépendre de sa propre horloge
    settings:        Optional[RoomSettings] = None
    turn_deadline:   Optional[datetime] = None
    server_now:      Optional[datetime] = None

    class Config:
        from_attributes = True


class PlayMoveRequest(BaseModel):
    """Corps de POST /multiplayer/{room_id}/move"""
    placements: list[dict[str, Any]]
    # Chaque élément : { "r": int, "c": int, "letter": str }


class SwapRequest(BaseModel):
    """Corps de POST /multiplayer/{room_id}/swap"""
    letters: list[str]
