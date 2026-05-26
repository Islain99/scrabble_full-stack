# app/users/router.py
#
# ⚡ Changements :
#   - UpdateProfileRequest : ajout first_name, last_name, age, country
#   - UserOut              : expose les nouveaux champs + profile_complete
#   - PATCH /me            : recalcule profile_complete après chaque màj

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.db.database import get_db
from app.db.models import User, GameHistory
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Utilisateurs"])


# ── Schemas ────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    firebase_uid: str
    email: str
    display_name: str
    first_name: str | None
    last_name: str | None
    age: int | None
    country: str | None
    avatar_url: str | None
    bio: str | None
    auth_provider: str
    is_verified: bool
    profile_complete: bool
    games_played: int
    games_won: int
    total_score: int
    best_score: int
    best_word: str | None
    best_word_score: int
    average_score: float
    win_rate: float
    created_at: datetime
    last_login_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            firebase_uid=user.firebase_uid,
            email=user.email,
            display_name=user.display_name,
            first_name=user.first_name,
            last_name=user.last_name,
            age=user.age,
            country=user.country,
            avatar_url=user.avatar_url,
            bio=user.bio,
            auth_provider=user.auth_provider,
            is_verified=user.is_verified,
            profile_complete=user.profile_complete,
            games_played=user.games_played,
            games_won=user.games_won,
            total_score=user.total_score,
            best_score=user.best_score,
            best_word=user.best_word,
            best_word_score=user.best_word_score,
            average_score=user.average_score,
            win_rate=user.win_rate,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        )


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    age: int | None = None
    country: str | None = None
    avatar_url: str | None = None
    bio: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Le pseudo doit contenir au moins 2 caractères.")
        if len(v) > 32:
            raise ValueError("Le pseudo ne peut pas dépasser 32 caractères.")
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Ce champ ne peut pas être vide.")
        if len(v) > 64:
            raise ValueError("Ce champ ne peut pas dépasser 64 caractères.")
        return v

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 5 or v > 120:
            raise ValueError("Âge invalide (entre 5 et 120).")
        return v

    @field_validator("country")
    @classmethod
    def validate_country(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Pays invalide.")
        if len(v) > 100:
            raise ValueError("Pays trop long.")
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
    """
    Met à jour le profil du joueur.
    Recalcule profile_complete après chaque modification.
    """
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    if payload.age is not None:
        current_user.age = payload.age
    if payload.country is not None:
        current_user.country = payload.country
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url
    if payload.bio is not None:
        current_user.bio = payload.bio

    # Recalcule le flag profile_complete
    current_user.check_profile_complete()

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
    """Historique paginé des parties."""
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
    """Sauvegarde une partie terminée et met à jour les stats."""
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
    """Profil public d'un joueur (classement, matchmaking futur)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Joueur introuvable.")
    return UserOut.from_user(user)