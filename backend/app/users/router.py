# app/users/router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.db.database import get_db
from app.db.models import User, GameHistory
from app.auth.dependencies import get_current_user
from app.auth.router import UserOut

router = APIRouter(prefix="/users", tags=["Utilisateurs"])


# ── Schemas ────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Le pseudo doit contenir au moins 2 caractères.")
        if len(v) > 32:
            raise ValueError("Le pseudo ne peut pas dépasser 32 caractères.")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v and len(v) > 280:
            raise ValueError("La bio ne peut pas dépasser 280 caractères.")
        return v


class GameHistoryOut(BaseModel):
    id: int
    game_id: str
    user_score: int
    ai_name: str
    ai_score: int
    ai_difficulty: str
    won: bool
    duration_seconds: int | None
    turns_count: int
    best_word: str | None
    best_word_score: int
    created_at: datetime

    class Config:
        from_attributes = True


class SaveGameRequest(BaseModel):
    """Appelé par le frontend à la fin de chaque partie."""
    game_id: str
    user_score: int
    ai_name: str = "HAL 9000"
    ai_score: int
    ai_difficulty: str = "medium"
    won: bool
    duration_seconds: int | None = None
    turns_count: int = 0
    best_word: str | None = None
    best_word_score: int = 0


# ── Routes ─────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Profil complet + stats de l'utilisateur connecté."""
    return UserOut.from_user(current_user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Met à jour le pseudo, la bio ou l'avatar."""
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.bio is not None:
        current_user.bio = payload.bio
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url

    await db.flush()
    await db.refresh(current_user)
    return UserOut.from_user(current_user)


@router.get("/me/history", response_model=list[GameHistoryOut])
async def get_history(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Historique paginé des parties de l'utilisateur."""
    result = await db.execute(
        select(GameHistory)
        .where(GameHistory.user_id == current_user.id)
        .order_by(desc(GameHistory.created_at))
        .limit(min(limit, 50))
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/me/games", response_model=GameHistoryOut, status_code=status.HTTP_201_CREATED)
async def save_game(
    payload: SaveGameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sauvegarde une partie terminée et met à jour les stats du joueur.
    Appelé automatiquement par le frontend quand status === 'FINISHED'.
    Idempotent : une deuxième requête avec le même game_id retourne 409.
    """
    # Éviter les doublons
    existing = await db.execute(
        select(GameHistory).where(GameHistory.game_id == payload.game_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette partie a déjà été enregistrée.",
        )

    game = GameHistory(
        game_id=payload.game_id,
        user_id=current_user.id,
        user_score=payload.user_score,
        ai_name=payload.ai_name,
        ai_score=payload.ai_score,
        ai_difficulty=payload.ai_difficulty,
        won=payload.won,
        duration_seconds=payload.duration_seconds,
        turns_count=payload.turns_count,
        best_word=payload.best_word,
        best_word_score=payload.best_word_score,
    )
    db.add(game)

    # Mettre à jour les stats dénormalisées
    current_user.update_stats_after_game(
        score=payload.user_score,
        won=payload.won,
        best_word=payload.best_word,
        best_word_score=payload.best_word_score,
    )

    await db.flush()
    await db.refresh(game)
    return game


@router.get("/{user_id}/profile", response_model=UserOut)
async def get_public_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    """Profil public d'un joueur (accessible sans auth — pour le classement)."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    return UserOut.from_user(user)