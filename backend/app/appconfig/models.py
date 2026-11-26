# app/appconfig/models.py
#
# Dashboard admin, lot A2 : configuration globale modifiable depuis le dashboard.
# Une ligne par document JSON :
#   settings        politique des paramètres (défauts, verrouillés, masqués, options)
#   privacy_policy  texte de la politique de confidentialité (FR / EN)
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AppConfig(Base):
    __tablename__ = "app_config"

    key:        Mapped[str] = mapped_column(String(32), primary_key=True)
    value:      Mapped[dict] = mapped_column(JSONType, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
