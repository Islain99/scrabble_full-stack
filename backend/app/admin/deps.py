# app/admin/deps.py
#
# Accès au dashboard : réservé aux comptes `is_admin` (vérifié en base à chaque requête).
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.models import User
from app.admin.models import AdminAction


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Réservé aux administrateurs.")
    return current_user


def log_action(db: AsyncSession, admin: User, action: str, *, target_type: Optional[str] = None,
               target_id: Optional[int] = None, details: Optional[dict[str, Any]] = None) -> AdminAction:
    """Ajoute une ligne au journal (écrite avec la transaction de la requête)."""
    entry = AdminAction(admin_id=admin.id, action=action, target_type=target_type,
                        target_id=target_id, details=details or None)
    db.add(entry)
    return entry
