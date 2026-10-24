# app/solo/models.py
#
# Table `solo_games` : une ligne par partie solo (joueur contre l'IA).
# L'état complet de la partie (GameState) y est stocké en JSON, ce qui permet
# de la reprendre après un redéploiement ou un redémarrage du serveur.
#
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

# JSONB sous PostgreSQL, JSON ailleurs (SQLite pour les tests)
JSONType = JSON().with_variant(JSONB(), "postgresql")


class SoloGame(Base):
    __tablename__ = "solo_games"

    game_id:     Mapped[str]  = mapped_column(String(36), primary_key=True)
    difficulty:  Mapped[str]  = mapped_column(String(16), nullable=False)
    status:      Mapped[str]  = mapped_column(String(16), nullable=False)
    state:       Mapped[dict] = mapped_column(JSONType, nullable=False)

    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Le nettoyage périodique filtre sur le statut et la dernière activité
        Index("ix_solo_games_status_updated", "status", "updated_at"),
    )
