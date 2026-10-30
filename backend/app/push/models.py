# app/push/models.py
#
# Notifications push (lot 7) : un jeton par appareil (navigateur ou appli Android/iOS).
# Supprimé quand le joueur se déconnecte, coupe les notifications, quand Firebase
# le déclare périmé, ou avec le compte (ON DELETE CASCADE).
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PushToken(Base):
    __tablename__ = "push_tokens"

    id:           Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:      Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token:        Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    platform:     Mapped[str] = mapped_column(String(16), nullable=False, default="web")   # web | android | ios
    locale:       Mapped[str] = mapped_column(String(8), nullable=False, default="fr")
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
