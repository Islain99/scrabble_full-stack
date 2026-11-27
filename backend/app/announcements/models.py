# app/announcements/models.py
#
# Publications de l'administrateur (lot A4) : annonces en français et en anglais,
# montrées dans un bandeau de l'application et/ou envoyées en notification
# (cloche + push), à tous les joueurs ou à certains niveaux d'abonnement.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnnouncementStatus:
    DRAFT     = "draft"        # en préparation : personne ne la voit
    PUBLISHED = "published"    # visible entre starts_at et ends_at
    ARCHIVED  = "archived"     # retirée


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = (Index("ix_announcements_status_starts", "status", "starts_at"),)

    id:          Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title_fr:    Mapped[str] = mapped_column(String(120), nullable=False)
    title_en:    Mapped[str] = mapped_column(String(120), nullable=False)
    body_fr:     Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_en:     Mapped[str] = mapped_column(Text, nullable=False, default="")
    # info | event | update | maintenance | promo (couleur et icône du bandeau)
    kind:        Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    # Lien facultatif : page de l'application (#/…) ou adresse https://
    link:        Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Public : None = tout le monde (invités compris) ; sinon liste d'id de niveaux d'abonnement
    audience_tiers: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)
    show_banner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify:      Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status:      Mapped[str] = mapped_column(String(16), nullable=False, default=AnnouncementStatus.DRAFT)
    starts_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notified_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
