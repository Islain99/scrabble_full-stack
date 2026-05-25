# app/auth/router.py
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator

from app.core.firebase import verify_firebase_token
from app.db.database import get_db
from app.db.models import User
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentification"])
bearer_scheme = HTTPBearer(auto_error=True)


# ── Schemas ────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    firebase_token: str
    display_name: str

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Le pseudo doit contenir au moins 2 caractères.")
        if len(v) > 32:
            raise ValueError("Le pseudo ne peut pas dépasser 32 caractères.")
        return v


class UserOut(BaseModel):
    id: int
    firebase_uid: str
    email: str
    display_name: str
    avatar_url: str | None
    bio: str | None
    auth_provider: str
    is_verified: bool
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
            avatar_url=user.avatar_url,
            bio=user.bio,
            auth_provider=user.auth_provider,
            is_verified=user.is_verified,
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


class LoginResponse(BaseModel):
    user: UserOut
    is_new_user: bool


# ── Routes ─────────────────────────────────────────────────────────

@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Enregistre un nouvel utilisateur après création Firebase.
    Flow :
      1. Le client crée le compte Firebase (email/password ou OAuth)
      2. Le client appelle cette route avec le idToken Firebase
      3. Le backend crée le profil dans PostgreSQL
    Route idempotente : si le profil existe déjà, retourne is_new_user=False.
    """
    try:
        decoded = verify_firebase_token(payload.firebase_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Firebase invalide.")

    firebase_uid = decoded["uid"]
    email = decoded.get("email", "")
    provider = decoded.get("firebase", {}).get("sign_in_provider", "email")
    avatar_url = decoded.get("picture")
    email_verified = decoded.get("email_verified", False)

    # Idempotent : si le profil existe déjà
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    existing = result.scalar_one_or_none()
    if existing:
        existing.last_login_at = datetime.now(timezone.utc)
        return LoginResponse(user=UserOut.from_user(existing), is_new_user=False)

    # Vérifier unicité email
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte avec cet email existe déjà.",
        )

    user = User(
        firebase_uid=firebase_uid,
        email=email,
        display_name=payload.display_name,
        avatar_url=avatar_url,
        auth_provider=provider,
        is_verified=email_verified,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return LoginResponse(user=UserOut.from_user(user), is_new_user=True)


@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Login : vérifie le token Firebase et met à jour last_login_at.
    Crée automatiquement le profil PostgreSQL pour les connexions OAuth Google
    (first-time login via Google — pas de /register séparé).
    """
    try:
        decoded = verify_firebase_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")

    firebase_uid = decoded["uid"]
    email = decoded.get("email", "")
    provider = decoded.get("firebase", {}).get("sign_in_provider", "email")
    avatar_url = decoded.get("picture")
    email_verified = decoded.get("email_verified", False)

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()
    is_new = False

    if not user:
        # Premier login Google/OAuth — création auto du profil
        display_name = decoded.get("name") or email.split("@")[0]
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            auth_provider=provider,
            is_verified=email_verified,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        is_new = True
    else:
        user.last_login_at = datetime.now(timezone.utc)
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url

    return LoginResponse(user=UserOut.from_user(user), is_new_user=is_new)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Retourne le profil de l'utilisateur connecté."""
    return UserOut.from_user(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)):
    """
    Le vrai logout se fait côté client (Firebase signOut()).
    Cette route existe pour des actions serveur au logout (audit log, révocation, etc.).
    """
    return None