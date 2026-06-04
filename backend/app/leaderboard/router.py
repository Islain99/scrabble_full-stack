# app/leaderboard/router.py

import time
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import User, GameHistory
from app.auth.dependencies import get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leaderboard", tags=["Classement"])


# ── Cache TTL en mémoire ───────────────────────────────────────────
# Clé : (period, sort_by, limit)  →  (timestamp_expiry, LeaderboardResponse)
# TTL : 60 s pour "week"/"month", 120 s pour "all" (change moins souvent).
# Sans dépendance externe — parfait pour Railway single-worker.

_cache: dict[tuple, tuple[float, "LeaderboardResponse"]] = {}

_TTL: dict[str, int] = {
    "all":   120,
    "month":  60,
    "week":   60,
}


def _cache_get(key: tuple) -> "LeaderboardResponse | None":
    entry = _cache.get(key)
    if entry is None:
        return None
    expiry, data = entry
    if time.monotonic() > expiry:
        del _cache[key]
        return None
    return data


def _cache_set(key: tuple, data: "LeaderboardResponse", ttl: int) -> None:
    # Limite la taille du cache (évite les fuites mémoire)
    if len(_cache) > 256:
        _cache.clear()
    _cache[key] = (time.monotonic() + ttl, data)


# ── Schemas ────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    display_name: str
    avatar_url: str | None
    games_played: int
    games_won: int
    win_rate: float
    best_score: int
    average_score: float
    best_word: str | None
    best_word_score: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total_players: int
    period: str
    sort_by: str
    current_user_rank: int | None = None
    cached: bool = False  # indique si la réponse vient du cache (utile en debug)


# ── Route ──────────────────────────────────────────────────────────

@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    period: str = Query("all", pattern="^(all|month|week)$"),
    sort_by: str = Query("best_score", pattern="^(best_score|average_score|games_won|games_played)$"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Classement global des joueurs.
    - period  : all | month | week
    - sort_by : best_score | average_score | games_won | games_played
    - Réponse mise en cache (60–120 s) pour réduire les appels DB.
    - Le rang de l'utilisateur connecté est calculé à chaque requête (non caché).
    """
    cache_key = (period, sort_by, limit)
    cached_response = _cache_get(cache_key)

    if cached_response is not None:
        # Recalculer le rang de l'utilisateur sur la réponse cachée (données personnelles)
        current_user_rank = next(
            (e.rank for e in cached_response.entries if current_user and e.user_id == current_user.id),
            None,
        )
        return cached_response.model_copy(
            update={"current_user_rank": current_user_rank, "cached": True}
        )

    # ── Requête DB ────────────────────────────────────────────────
    sort_col = {
        "best_score":    User.best_score,
        "average_score": User.average_score,
        "games_won":     User.games_won,
        "games_played":  User.games_played,
    }.get(sort_by, User.best_score)

    base_query = (
        select(User)
        .where(User.is_active == True, User.games_played > 0)
        .order_by(desc(sort_col))
        .limit(limit)
    )

    if period in ("month", "week"):
        cutoff = datetime.now(timezone.utc) - timedelta(days=30 if period == "month" else 7)
        active_ids = (
            select(GameHistory.user_id)
            .where(GameHistory.created_at >= cutoff)
            .distinct()
            .scalar_subquery()
        )
        base_query = base_query.where(User.id.in_(active_ids))

    result = await db.execute(base_query)
    users = result.scalars().all()

    count_query = select(func.count(User.id)).where(
        User.is_active == True,
        User.games_played > 0,
    )
    total = (await db.execute(count_query)).scalar_one()

    entries = [
        LeaderboardEntry(
            rank=rank,
            user_id=u.id,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            games_played=u.games_played,
            games_won=u.games_won,
            win_rate=u.win_rate,
            best_score=u.best_score,
            average_score=u.average_score,
            best_word=u.best_word,
            best_word_score=u.best_word_score,
        )
        for rank, u in enumerate(users, start=1)
    ]

    current_user_rank = next(
        (e.rank for e in entries if current_user and e.user_id == current_user.id),
        None,
    )

    response = LeaderboardResponse(
        entries=entries,
        total_players=total,
        period=period,
        sort_by=sort_by,
        current_user_rank=current_user_rank,
        cached=False,
    )

    ttl = _TTL.get(period, 60)
    _cache_set(cache_key, response, ttl)
    logger.debug("Leaderboard mis en cache : key=%s ttl=%ds entries=%d", cache_key, ttl, len(entries))

    return response