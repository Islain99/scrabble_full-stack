# app/economy/service.py
#
# Mouvements de crédits (lot A3). Toujours par `apply()` : mise à jour atomique du
# solde (jamais négatif) et ligne dans le grand livre, dans la transaction de la
# requête. Un gain lié à une partie porte une référence unique (user, kind, ref) :
# il ne peut pas être versé deux fois.
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.appconfig import service as config_service
from app.economy.models import CreditTransaction, SubscriptionTier, UserUnlock
from app.economy.rules import GAME_KINDS, EconomyRules, builtin_rules

logger = logging.getLogger(__name__)

ECONOMY_KEY = "economy"


class InsufficientCredits(Exception):
    def __init__(self, balance: int, needed: int):
        super().__init__(f"Solde insuffisant : {balance} crédits, {needed} nécessaires.")
        self.balance, self.needed = balance, needed


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def today_utc() -> str:
    return _utcnow().date().isoformat()


async def get_rules(db: AsyncSession) -> EconomyRules:
    row = await config_service.get_row(db, ECONOMY_KEY)
    if row is None:
        return builtin_rules()
    try:
        return EconomyRules.model_validate(row.value)
    except Exception as exc:                  # document abîmé : on n'empêche pas de jouer
        logger.error("Règles des crédits invalides en base : %s", exc)
        return builtin_rules()


async def find(db: AsyncSession, user_id: int, kind: str, ref: str) -> Optional[CreditTransaction]:
    return (await db.execute(select(CreditTransaction).where(
        CreditTransaction.user_id == user_id, CreditTransaction.kind == kind, CreditTransaction.ref == ref,
    ))).scalar_one_or_none()


async def apply(db: AsyncSession, user, amount: int, kind: str, *, ref: Optional[str] = None,
                note: Optional[str] = None, admin_id: Optional[int] = None,
                record_zero: bool = False) -> Optional[CreditTransaction]:
    """
    Ajoute `amount` (négatif pour une dépense) au solde de `user`.
    - Dépense plus grande que le solde → InsufficientCredits (rien n'est écrit)
    - Référence déjà utilisée (gain déjà versé) → None (rien n'est écrit)
    - Montant nul : rien, sauf `record_zero` (indice gratuit : compté dans le grand livre)
    """
    from app.db.models import User
    if amount == 0 and not record_zero:
        return None
    if ref is not None and await find(db, user.id, kind, ref) is not None:
        return None
    # Une seule instruction : le solde ne peut pas devenir négatif, même avec deux requêtes simultanées
    new_balance = (await db.execute(
        update(User).where(User.id == user.id, User.credits + amount >= 0)
        .values(credits=User.credits + amount).returning(User.credits)
    )).scalar_one_or_none()
    if new_balance is None:
        balance = (await db.execute(select(User.credits).where(User.id == user.id))).scalar_one()
        raise InsufficientCredits(balance, -amount)
    tx = CreditTransaction(user_id=user.id, amount=amount, balance_after=new_balance, kind=kind,
                           ref=ref, note=(note or None) and note[:200], admin_id=admin_id)
    try:
        async with db.begin_nested():
            db.add(tx)
            await db.flush()
    except IntegrityError:
        # Course rare : la même référence vient d'être versée par une autre requête → on annule
        await db.execute(update(User).where(User.id == user.id).values(credits=User.credits - amount))
        user.credits = new_balance - amount
        return None
    user.credits = new_balance
    return tx


async def game_earnings_today(db: AsyncSession, user_id: int) -> int:
    start = datetime.combine(_utcnow().date(), datetime.min.time(), tzinfo=timezone.utc)
    total = (await db.execute(select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
        CreditTransaction.user_id == user_id, CreditTransaction.kind.in_(GAME_KINDS),
        CreditTransaction.created_at >= start,
    ))).scalar_one()
    return int(total or 0)


async def earn_for_game(db: AsyncSession, user, kind: str, ref: str, amount: int,
                        rules: EconomyRules) -> Optional[CreditTransaction]:
    """Gain d'une partie, réduit au plafond quotidien s'il y en a un."""
    if not rules.enabled or amount <= 0:
        return None
    if rules.daily_game_cap:
        room = rules.daily_game_cap - await game_earnings_today(db, user.id)
        amount = min(amount, max(room, 0))
        if amount <= 0:
            return None
    return await apply(db, user, amount, kind, ref=ref)


async def earn_signup(db: AsyncSession, user) -> None:
    rules = await get_rules(db)
    if rules.enabled and rules.signup_bonus:
        await apply(db, user, rules.signup_bonus, "signup", ref="signup")


async def earn_daily(db: AsyncSession, user) -> Optional[CreditTransaction]:
    """Bonus de la première connexion du jour (UTC)."""
    today = today_utc()
    if user.last_daily_credit_on == today:
        return None
    rules = await get_rules(db)
    if not rules.enabled or not rules.daily_login:
        return None
    user.last_daily_credit_on = today
    return await apply(db, user, rules.daily_login, "daily", ref=today)


# ── Niveaux d'abonnement ──────────────────────────────────────────

async def tiers(db: AsyncSession) -> list[SubscriptionTier]:
    return list((await db.execute(
        select(SubscriptionTier).order_by(SubscriptionTier.sort_order, SubscriptionTier.id)
    )).scalars())


# ── Palettes premium ──────────────────────────────────────────────

async def owned(db: AsyncSession, user_id: int, item_type: str = "palette") -> set[str]:
    return set((await db.execute(select(UserUnlock.item_key).where(
        UserUnlock.user_id == user_id, UserUnlock.item_type == item_type,
    ))).scalars())


async def locked_palettes(db: AsyncSession, user, rules: Optional[EconomyRules] = None) -> set[str]:
    """Palettes premium que ce joueur n'a pas débloquées."""
    rules = rules or await get_rules(db)
    premium = set(rules.premium_palettes)
    if not premium:
        return set()
    return premium - await owned(db, user.id)


async def keep_current_palettes(db: AsyncSession, newly_premium: set[str]) -> int:
    """
    Une palette devient premium : les joueurs qui l'utilisent déjà la gardent
    (déblocage « kept »). Retourne le nombre de déblocages ajoutés.
    """
    from app.db.models import User
    if not newly_premium:
        return 0
    rows = (await db.execute(select(User.id, User.game_preferences).where(User.game_preferences.is_not(None)))).all()
    already = {(uid, key) for uid, key in (await db.execute(
        select(UserUnlock.user_id, UserUnlock.item_key).where(UserUnlock.item_type == "palette")
    )).all()}
    added = 0
    for uid, prefs in rows:
        key = (prefs or {}).get("colorPalette")
        if key in newly_premium and (uid, key) not in already:
            db.add(UserUnlock(user_id=uid, item_type="palette", item_key=key, via="kept"))
            added += 1
    await db.flush()
    return added


def period_start(days: int) -> datetime:
    return _utcnow() - timedelta(days=days)
