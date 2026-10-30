# app/push/router.py
#
# Notifications push (lot 7) : inscription des appareils.
#
#   POST   /push/tokens        inscrire (ou rafraîchir) le jeton de cet appareil
#   DELETE /push/tokens        le retirer (déconnexion, notifications coupées)
#   POST   /push/test          s'envoyer une notification d'essai
#
# Les catégories (invitations, amis, messages, parties) se règlent dans les
# préférences de jeu : pushInvites, pushFriends, pushMessages, pushTurn.
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.push import service
from app.push.models import PushToken

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["Notifications push"])

MAX_TOKENS_PER_USER = 10


class TokenIn(BaseModel):
    token:    str
    platform: Literal["web", "android", "ios"] = "web"
    locale:   str = "fr"

    @field_validator("token")
    @classmethod
    def _token(cls, v: str) -> str:
        v = (v or "").strip()
        if not v or len(v) > 512:
            raise ValueError("Jeton invalide.")
        return v

    @field_validator("locale")
    @classmethod
    def _locale(cls, v: str) -> str:
        return "en" if (v or "").lower().startswith("en") else "fr"


class TokenRemoveIn(BaseModel):
    token: str


class TestOut(BaseModel):
    devices: int


@router.post("/tokens", status_code=status.HTTP_204_NO_CONTENT, summary="Inscrire cet appareil")
async def register_token(body: TokenIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    row = (await db.execute(select(PushToken).where(PushToken.token == body.token))).scalar_one_or_none()
    if row is None:
        db.add(PushToken(user_id=current_user.id, token=body.token, platform=body.platform,
                         locale=body.locale, created_at=now, last_seen_at=now))
    else:
        # Même appareil, autre compte : le jeton change de propriétaire
        row.user_id, row.platform, row.locale, row.last_seen_at = current_user.id, body.platform, body.locale, now
    await db.flush()

    # Au plus 10 appareils : les plus anciens sortent
    count = (await db.execute(select(func.count()).select_from(PushToken)
                              .where(PushToken.user_id == current_user.id))).scalar_one()
    if count > MAX_TOKENS_PER_USER:
        old = (await db.execute(select(PushToken.id).where(PushToken.user_id == current_user.id)
                                .order_by(PushToken.last_seen_at).limit(count - MAX_TOKENS_PER_USER))).scalars().all()
        await db.execute(delete(PushToken).where(PushToken.id.in_(old)))


@router.delete("/tokens", status_code=status.HTTP_204_NO_CONTENT, summary="Retirer cet appareil")
async def remove_token(body: TokenRemoveIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(PushToken).where(PushToken.token == body.token.strip(),
                                             PushToken.user_id == current_user.id))


@router.post("/test", response_model=TestOut, summary="M'envoyer une notification d'essai")
async def test_push(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    devices = (await db.execute(select(func.count()).select_from(PushToken)
                                .where(PushToken.user_id == current_user.id))).scalar_one()
    # Après la validation de la requête : la tâche relit les jetons dans sa propre session
    service.push([current_user.firebase_uid], "system", "test", {}, url="#/settings", tag="test")
    return TestOut(devices=devices)
