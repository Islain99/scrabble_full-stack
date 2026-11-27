# app/economy/models.py
#
# Dashboard admin, lot A3 : abonnements et crédits.
#   subscription_tiers   niveaux d'abonnement (nom, couleur, badge), attribués par un admin
#   credit_transactions  grand livre : chaque gain ou dépense de crédits, avec le solde après
#   user_unlocks         objets débloqués par un joueur (palettes premium)
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (Boolean, DateTime, ForeignKey, Index, Integer, String,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SubscriptionTier(Base):
    __tablename__ = "subscription_tiers"

    id:             Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug:           Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name_fr:        Mapped[str] = mapped_column(String(40), nullable=False)
    name_en:        Mapped[str] = mapped_column(String(40), nullable=False)
    description_fr: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    description_en: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    color:          Mapped[str] = mapped_column(String(7), nullable=False, default="#8a7a5c", server_default="#8a7a5c")
    # Badge affiché à côté du pseudo (emoji ou 1 à 4 caractères) ; vide = pas de badge
    badge:          Mapped[str] = mapped_column(String(8), nullable=False, default="", server_default="")
    sort_order:     Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Niveau des joueurs sans abonnement (un seul) ; il ne s'attribue pas
    is_default:     Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    # Un gain lié à une partie (ou un achat lié à un objet) n'est versé qu'une fois
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "ref", name="uq_credit_tx_user_kind_ref"),
        Index("ix_credit_tx_user_id_id", "user_id", "id"),
    )

    id:            Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:       Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount:        Mapped[int] = mapped_column(Integer, nullable=False)          # + gain, − dépense
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    # signup | daily | solo_win | mp_win | mp_draw | mp_loss | hint | unlock | admin_grant | admin_debit
    kind:          Mapped[str] = mapped_column(String(24), nullable=False)
    ref:           Mapped[Optional[str]] = mapped_column(String(80), nullable=True)   # partie, objet…
    note:          Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    admin_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)


class UserUnlock(Base):
    __tablename__ = "user_unlocks"

    user_id:    Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    item_type:  Mapped[str] = mapped_column(String(16), primary_key=True)        # palette
    item_key:   Mapped[str] = mapped_column(String(32), primary_key=True)
    # purchase (crédits) | kept (déjà utilisée quand elle est devenue premium) | admin
    via:        Mapped[str] = mapped_column(String(16), nullable=False, default="purchase")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
