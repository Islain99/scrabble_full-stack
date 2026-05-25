# app/leaderboard/router.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.db.database import get_db
from app.db.models import User, GameHistory
from app.auth.dependencies import get_current_user_optional

router = APIRouter(prefix="/leaderboard", tags=["Classement"])


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


# ── Routes ─────────────────────────────────────────────────────────

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
    - period : all | month | week
    - sort_by : best_score | average_score | games_won | games_played
    """
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

    # Filtre temporel via GameHistory
    if period in ("month", "week"):
        cutoff = datetime.now(timezone.utc) - timedelta(days=30 if period == "month" else 7)
        # Sous-requête : IDs des joueurs actifs dans la période
        active_ids = select(GameHistory.user_id).where(
            GameHistory.created_at >= cutoff
        ).distinct().subquery()
        base_query = base_query.where(User.id.in_(select(active_ids)))

    result = await db.execute(base_query)
    users = result.scalars().all()

    # Total
    count_query = select(func.count(User.id)).where(User.is_active == True, User.games_played > 0)
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

    # Rang de l'utilisateur connecté
    current_user_rank = next(
        (e.rank for e in entries if current_user and e.user_id == current_user.id),
        None
    )

    return LeaderboardResponse(
        entries=entries,
        total_players=total,
        period=period,
        sort_by=sort_by,
        current_user_rank=current_user_rank,
    )