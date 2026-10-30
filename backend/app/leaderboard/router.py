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
    # Multijoueur (mode=multi) : cote Elo, record, égalités
    rating: int | None = None
    peak_rating: int | None = None
    games_drawn: int | None = None


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total_players: int
    period: str
    sort_by: str
    mode: str = "solo"
    current_user_rank: int | None = None
    cached: bool = False  # indique si la réponse vient du cache (utile en debug)


# ── Route ──────────────────────────────────────────────────────────

SOLO_SORTS  = {"best_score", "average_score", "games_won", "games_played"}
MULTI_SORTS = {"rating", "games_won", "games_played", "best_score"}
MP_MODE = "multiplayer"     # GameHistory.ai_difficulty des parties multijoueur


def _cutoff(period: str) -> datetime | None:
    if period not in ("month", "week"):
        return None
    return datetime.now(timezone.utc) - timedelta(days=30 if period == "month" else 7)


def _solo_entry(rank: int, u: User) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=rank, user_id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
        games_played=u.games_played, games_won=u.games_won, win_rate=u.win_rate,
        best_score=u.best_score, average_score=u.average_score,
        best_word=u.best_word, best_word_score=u.best_word_score,
    )


def _multi_entry(rank: int, u: User) -> LeaderboardEntry:
    games = u.mp_games or 0
    return LeaderboardEntry(
        rank=rank, user_id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
        games_played=games, games_won=u.mp_wins or 0, win_rate=u.mp_win_rate,
        best_score=u.mp_best_score or 0,
        average_score=round((u.mp_total_score or 0) / games, 2) if games else 0.0,
        best_word=None, best_word_score=0,
        rating=u.mp_rating, peak_rating=u.mp_peak_rating, games_drawn=u.mp_draws or 0,
    )


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    mode: str = Query("solo", pattern="^(solo|multi)$"),
    period: str = Query("all", pattern="^(all|month|week)$"),
    sort_by: str | None = Query(None, pattern="^(best_score|average_score|games_won|games_played|rating)$"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Classements des joueurs (lot 7 : solo et multijoueur séparés).
    - mode    : solo (contre l'IA) | multi (contre des joueurs, cote Elo)
    - period  : all | month | week (joueurs ayant joué dans ce mode sur la période)
    - sort_by : solo  → best_score | average_score | games_won | games_played
                multi → rating | games_won | games_played | best_score
    - Réponse mise en cache (60–120 s) pour réduire les appels DB.
    - Le rang de l'utilisateur connecté est recalculé à chaque requête (non caché).
    """
    allowed = MULTI_SORTS if mode == "multi" else SOLO_SORTS
    if sort_by not in allowed:
        sort_by = "rating" if mode == "multi" else "best_score"

    cache_key = (mode, period, sort_by, limit)
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
    if mode == "multi":
        sort_col = {
            "rating":       User.mp_rating,
            "games_won":    User.mp_wins,
            "games_played": User.mp_games,
            "best_score":   User.mp_best_score,
        }[sort_by]
        played = User.mp_games > 0
        tie = User.mp_games
    else:
        sort_col = {
            "best_score":    User.best_score,
            "average_score": User.average_score,
            "games_won":     User.games_won,
            "games_played":  User.games_played,
        }[sort_by]
        played = User.games_played > 0
        tie = User.games_played

    base_query = (
        select(User)
        .where(User.is_active == True, played)  # noqa: E712
        .order_by(desc(sort_col), desc(tie), User.id)
        .limit(limit)
    )

    cutoff = _cutoff(period)
    if cutoff is not None:
        mode_filter = (GameHistory.ai_difficulty == MP_MODE) if mode == "multi" else (GameHistory.ai_difficulty != MP_MODE)
        active_ids = (
            select(GameHistory.user_id)
            .where(GameHistory.created_at >= cutoff, mode_filter)
            .distinct()
            .scalar_subquery()
        )
        base_query = base_query.where(User.id.in_(active_ids))

    result = await db.execute(base_query)
    users = result.scalars().all()

    count_query = select(func.count(User.id)).where(User.is_active == True, played)  # noqa: E712
    total = (await db.execute(count_query)).scalar_one()

    make = _multi_entry if mode == "multi" else _solo_entry
    entries = [make(rank, u) for rank, u in enumerate(users, start=1)]

    current_user_rank = next(
        (e.rank for e in entries if current_user and e.user_id == current_user.id),
        None,
    )

    response = LeaderboardResponse(
        entries=entries,
        total_players=total,
        period=period,
        sort_by=sort_by,
        mode=mode,
        current_user_rank=current_user_rank,
        cached=False,
    )

    ttl = _TTL.get(period, 60)
    _cache_set(cache_key, response, ttl)
    logger.debug("Leaderboard mis en cache : key=%s ttl=%ds entries=%d", cache_key, ttl, len(entries))

    return response