# app/auth/dependencies.py
#
# ⚡ Changements vs version précédente :
#   - `except (firebase_auth.InvalidIdTokenError, Exception)` splité en deux blocs
#     distincts pour ne pas masquer les erreurs internes en 401.
#   - Les erreurs inattendues remontent en 500 (comportement FastAPI par défaut).

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from firebase_admin import auth as firebase_auth

from app.core.firebase import verify_firebase_token
from app.db.database import get_db
from app.db.models import User

bearer_scheme = HTTPBearer(auto_error=True)
bearer_optional = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency principale — vérifie le token Firebase Bearer
    et retourne l'utilisateur PostgreSQL correspondant.

    Utilisation dans une route :
        @router.get("/me")
        async def me(user: User = Depends(get_current_user)):
            ...
    """
    token = credentials.credentials

    # 1. Vérifier le token Firebase
    try:
        decoded = verify_firebase_token(token)
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expiré — veuillez vous reconnecter.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (
        firebase_auth.InvalidIdTokenError,
        firebase_auth.RevokedIdTokenError,
        firebase_auth.CertificateFetchError,
    ):
        # Erreurs Firebase connues → 401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Les autres exceptions (réseau, bug interne, etc.) remontent en 500
    # — FastAPI les capture et renvoie une réponse 500 générique.

    firebase_uid = decoded.get("uid")
    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="UID manquant dans le token.",
        )

    # 2. Trouver l'utilisateur dans PostgreSQL
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil introuvable. Veuillez vous enregistrer via /api/v2/auth/register.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé.",
        )

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Dependency optionnelle — retourne l'user ou None si non connecté."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None