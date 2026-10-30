# app/notifications/service.py
#
# Notifications en direct (lot 5) : le serveur dépose une fiche dans
# /notifications/{uid}/{clé} de la base temps réel ; le navigateur du joueur
# l'affiche (cloche, bandeau). Seul le serveur écrit ; chacun ne lit que les siennes.
#
# Clés : inv-{id} (invitation à jouer), fr-{id} (demande d'ami),
#        fra-{id} (demande acceptée), invd-{id} (invitation refusée).
# Les invitations et demandes en attente sont aussi en base (GET /notifications,
# repli sans temps réel) ; les avis « acceptée » / « refusée » ne vivent que dans
# la base temps réel, jusqu'à ce que le joueur les ferme.
#
# Ce module n'importe aucun router : friends et multiplayer s'en servent.
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.notifications.models import GameInvitation, InvitationStatus
from app.push import service as push_service

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _notify_write(uid: str, key: str, payload: Optional[dict]) -> None:
    """Écrit (payload) ou retire (None) /notifications/{uid}/{key} (synchrone, erreurs ignorées)."""
    try:
        from firebase_admin import db as rtdb
        node = rtdb.reference(f"/notifications/{uid}/{key}")
        if payload is None:
            node.delete()
        else:
            node.set({k: v for k, v in payload.items() if v is not None})
    except Exception as exc:
        logger.warning("Notification RTDB ignorée (uid=%s, %s) : %s", uid, key, exc)


async def notify(uid: Optional[str], key: str, payload: Optional[dict]) -> None:
    if not uid:
        return
    if payload is not None:
        payload = {"created_at": _now_ms(), **payload}
    await asyncio.to_thread(_notify_write, uid, key, payload)
    push_service.from_notification(uid, key, payload)     # lot 7 : notification push (en tâche de fond)


async def notify_user(db: AsyncSession, user_id: int, key: str, payload: Optional[dict]) -> None:
    uid = (await db.execute(select(User.firebase_uid).where(User.id == user_id))).scalar_one_or_none()
    await notify(uid, key, payload)


async def expire_room_invitations(db: AsyncSession, room_id: str, keep_id: Optional[int] = None) -> list[tuple[str, str]]:
    """
    Invitations en attente vers cette salle → expirées (la salle a démarré, a été
    annulée ou nettoyée). Retourne les fiches RTDB à retirer [(uid, clé)] ;
    l'appelant les retire après avoir validé la base (remove_notifications).
    """
    rows = (await db.execute(
        select(GameInvitation, User.firebase_uid)
        .join(User, User.id == GameInvitation.invitee_id)
        .where(GameInvitation.room_id == room_id, GameInvitation.status == InvitationStatus.PENDING)
    )).all()
    removals = []
    now = datetime.now(timezone.utc)
    for inv, uid in rows:
        if inv.id == keep_id:
            continue
        inv.status = InvitationStatus.EXPIRED
        inv.responded_at = now
        removals.append((uid, f"inv-{inv.id}"))
    if rows:
        await db.flush()
    return removals


async def remove_notifications(removals: list[tuple[str, str]]) -> None:
    for uid, key in removals:
        await asyncio.to_thread(_notify_write, uid, key, None)
