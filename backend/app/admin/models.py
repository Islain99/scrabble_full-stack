# app/admin/models.py
#
# Dashboard administrateur (lot A1) : journal des actions des administrateurs.
# Chaque modification faite depuis le dashboard (désactiver un compte, nommer un
# administrateur, renommer un pseudo…) y laisse une ligne : qui, quoi, sur qui, quand.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AdminAction(Base):
    __tablename__ = "admin_actions"
    __table_args__ = (Index("ix_admin_actions_target", "target_type", "target_id"),)

    id:          Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # SET NULL : le journal survit à la suppression du compte de l'administrateur
    admin_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action:      Mapped[str] = mapped_column(String(48), nullable=False)        # ex. user.disable
    target_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)   # user, config…
    target_id:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    details:     Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
