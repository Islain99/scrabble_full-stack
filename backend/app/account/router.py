# app/account/router.py
#
# Mon compte (lot 7 — Loi 25 sur la protection des renseignements personnels).
#
#   GET    /users/me/export    télécharger toutes mes données (JSON)
#   DELETE /users/me           supprimer définitivement mon compte
#
# La suppression demande de retaper son pseudo (confirm_name) : pas de suppression
# par erreur, ni par un simple lien.
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.account import service
from app.auth.dependencies import get_current_user
from app.db import database
from app.db.database import get_db
from app.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Mon compte"])

EXPORT_COOLDOWN_S = 30
_last_export: dict[int, float] = {}


class DeleteAccountIn(BaseModel):
    confirm_name: str


@router.get("/me/export", summary="Exporter mes données (JSON)")
async def export_my_data(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = time.monotonic()
    if now - _last_export.get(current_user.id, -1e9) < EXPORT_COOLDOWN_S:
        raise HTTPException(status_code=429, detail="Patientez quelques secondes avant un nouvel export.")
    _last_export[current_user.id] = now
    data = await service.export_user(db, current_user)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="scrabble-mes-donnees-{stamp}.json"',
                 "Cache-Control": "no-store"},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer définitivement mon compte")
async def delete_my_account(body: DeleteAccountIn, current_user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    if " ".join(body.confirm_name.split()).casefold() != " ".join(current_user.display_name.split()).casefold():
        raise HTTPException(status_code=422, detail="Retapez exactement votre pseudo pour confirmer.")
    user_id = current_user.id
    plan = await service.purge_user(db, current_user)
    await db.commit()                     # base validée avant Firebase (irréversible)
    logger.info("Compte %d supprimé à la demande de l'utilisateur", user_id)

    async def refresh_group(conv_id: int) -> None:
        from app.chat import router as chat_router
        from app.chat.models import Conversation
        async with database.AsyncSessionLocal() as session:
            conv = await session.get(Conversation, conv_id)
            if conv is not None:
                await chat_router._sync_members(session, conv)
                await chat_router._refresh_inboxes(session, conv)

    await service.after_commit(plan, refresh_group)
