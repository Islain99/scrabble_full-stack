# app/economy/router.py
#
# Abonnements et crédits côté joueurs (lot A3).
#   GET  /economy/tiers               niveaux d'abonnement (public : badges à afficher)
#   GET  /economy/rules               gains, prix des indices, palettes premium (public)
#   GET  /economy/me                  mon solde, mon niveau, mes palettes, mes derniers mouvements
#   GET  /economy/me/transactions     historique paginé
#   POST /economy/me/unlocks          débloquer une palette premium
# L'indice en partie solo est dans api/index.py (POST /game/hint/{game_id}).
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import database
from app.db.database import get_db
from app.db.models import User
from app.economy import service as economy
from app.economy.models import CreditTransaction, SubscriptionTier, UserUnlock
from app.economy.rules import builtin_rules

router = APIRouter(prefix="/economy", tags=["Crédits et abonnements"])

CACHE_HEADER = "public, max-age=60"


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class TierOut(BaseModel):
    id: int
    slug: str
    name_fr: str
    name_en: str
    description_fr: str
    description_en: str
    color: str
    badge: str
    sort_order: int
    is_default: bool

    @classmethod
    def of(cls, t: SubscriptionTier) -> "TierOut":
        return cls(id=t.id, slug=t.slug, name_fr=t.name_fr, name_en=t.name_en,
                   description_fr=t.description_fr or "", description_en=t.description_en or "",
                   color=t.color, badge=t.badge or "", sort_order=t.sort_order, is_default=bool(t.is_default))


class TransactionOut(BaseModel):
    id: int
    amount: int
    balance_after: int
    kind: str
    ref: Optional[str]
    note: Optional[str]
    created_at: datetime

    @classmethod
    def of(cls, tx: CreditTransaction) -> "TransactionOut":
        return cls(id=tx.id, amount=tx.amount, balance_after=tx.balance_after, kind=tx.kind,
                   ref=tx.ref, note=tx.note, created_at=_as_utc(tx.created_at))


class RulesOut(BaseModel):
    enabled: bool
    signup_bonus: int
    daily_login: int
    solo_win: dict[str, int]
    mp_win: int
    mp_draw: int
    mp_loss: int
    daily_game_cap: int
    hint_price: int
    hints_per_game: int
    premium_palettes: dict[str, int]


@router.get("/tiers", response_model=list[TierOut], summary="Niveaux d'abonnement")
async def list_tiers(response: Response):
    response.headers["Cache-Control"] = CACHE_HEADER
    if database.AsyncSessionLocal is None:
        return []
    async with database.AsyncSessionLocal() as session:
        return [TierOut.of(t) for t in await economy.tiers(session)]


@router.get("/rules", response_model=RulesOut, summary="Gains et prix")
async def public_rules(response: Response):
    response.headers["Cache-Control"] = CACHE_HEADER
    if database.AsyncSessionLocal is None:
        return RulesOut(**builtin_rules().model_dump())
    async with database.AsyncSessionLocal() as session:
        return RulesOut(**(await economy.get_rules(session)).model_dump())


class WalletOut(BaseModel):
    credits: int
    tier_id: Optional[int]
    tier_expires_at: Optional[datetime]
    unlocked_palettes: list[str]
    earned_today_games: int
    transactions: list[TransactionOut]


async def _wallet(db: AsyncSession, user: User) -> WalletOut:
    txs = (await db.execute(
        select(CreditTransaction).where(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.id.desc()).limit(10)
    )).scalars().all()
    tier_id = user.effective_tier_id()
    return WalletOut(
        credits=user.credits or 0, tier_id=tier_id,
        tier_expires_at=_as_utc(user.tier_expires_at) if tier_id else None,
        unlocked_palettes=sorted(await economy.owned(db, user.id)),
        earned_today_games=await economy.game_earnings_today(db, user.id),
        transactions=[TransactionOut.of(t) for t in txs],
    )


@router.get("/me", response_model=WalletOut, summary="Mon portefeuille")
async def my_wallet(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _wallet(db, user)


@router.get("/me/transactions", response_model=list[TransactionOut], summary="Mon historique de crédits")
async def my_transactions(limit: int = Query(30, ge=1, le=100), before_id: Optional[int] = Query(None, ge=1),
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conditions = [CreditTransaction.user_id == user.id]
    if before_id:
        conditions.append(CreditTransaction.id < before_id)
    rows = (await db.execute(
        select(CreditTransaction).where(*conditions).order_by(CreditTransaction.id.desc()).limit(limit)
    )).scalars().all()
    return [TransactionOut.of(t) for t in rows]


class UnlockIn(BaseModel):
    item_type: Literal["palette"] = "palette"
    item_key: str


@router.post("/me/unlocks", response_model=WalletOut, summary="Débloquer une palette premium")
async def unlock(body: UnlockIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rules = await economy.get_rules(db)
    price = rules.premium_palettes.get(body.item_key)
    if price is None:
        raise HTTPException(status_code=400, detail="Cette palette n'est pas à débloquer.")
    if body.item_key in await economy.owned(db, user.id):
        return await _wallet(db, user)                       # déjà à vous : rien à payer
    if not rules.enabled:
        raise HTTPException(status_code=403, detail="Les achats sont désactivés pour le moment.")
    try:
        await economy.apply(db, user, -price, "unlock", ref=f"palette:{body.item_key}")
    except economy.InsufficientCredits as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    db.add(UserUnlock(user_id=user.id, item_type="palette", item_key=body.item_key, via="purchase"))
    await db.flush()
    return await _wallet(db, user)
