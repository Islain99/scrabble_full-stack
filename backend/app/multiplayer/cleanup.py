# app/multiplayer/cleanup.py
#
# Nettoyage périodique des salles multijoueur (lancé par le lifespan, comme
# celui des parties solo) :
#
#   - salle en attente depuis WAITING_TTL sans adversaire  → supprimée ;
#   - partie sans aucun coup depuis ACTIVE_TTL             → terminée, le joueur
#     au trait perd (abandon par inactivité) ;
#   - partie terminée depuis RTDB_GRACE                    → nœud RTDB supprimé
#     (les deux joueurs ont reçu l'état final) ;
#   - partie terminée depuis FINISHED_RETENTION            → supprimée de la base.
#
# Le nettoyage est « au mieux » : une erreur est journalisée, jamais propagée.

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, delete, select

from app.db import database as db
from app.multiplayer.models import MultiplayerGame, RoomStatus
from app.push import service as push_service
from app.notifications.service import expire_room_invitations, remove_notifications

logger = logging.getLogger(__name__)

WAITING_TTL        = timedelta(hours=2)
ACTIVE_TTL         = timedelta(hours=24)
RTDB_GRACE         = timedelta(minutes=10)
FINISHED_RETENTION = timedelta(days=30)
CLEANUP_INTERVAL_S = 10 * 60


async def cleanup_rooms(now: Optional[datetime] = None) -> dict:
    """Un passage de nettoyage. Retourne le nombre de salles traitées par catégorie."""
    # Import différé : le router importe ce module indirectement via main.py
    from app.multiplayer import router as mp

    counts = {"waiting_deleted": 0, "active_forfeited": 0, "rtdb_cleared": 0, "finished_deleted": 0}
    if db.AsyncSessionLocal is None:
        return counts
    now = now or datetime.now(timezone.utc)
    rtdb_to_delete: list[str] = []
    rtdb_to_sync: list[tuple[str, dict, dict]] = []
    stale_invites: list[tuple[str, str]] = []

    async with db.AsyncSessionLocal() as session:
        async with session.begin():
            # 1. Salles en attente trop anciennes
            stale_waiting = (await session.execute(
                select(MultiplayerGame).where(
                    MultiplayerGame.status == RoomStatus.WAITING.value,
                    MultiplayerGame.created_at < now - WAITING_TTL,
                )
            )).scalars().all()
            for room in stale_waiting:
                rtdb_to_delete.append(room.room_id)
                stale_invites += await expire_room_invitations(session, room.room_id)   # lot 5
                await session.delete(room)
            counts["waiting_deleted"] = len(stale_waiting)

            # 2. Parties abandonnées : le joueur au trait perd
            stale_active = (await session.execute(
                select(MultiplayerGame).where(
                    MultiplayerGame.status == RoomStatus.ACTIVE.value,
                    MultiplayerGame.updated_at < now - ACTIVE_TTL,
                ).with_for_update()
            )).scalars().all()
            for room in stale_active:
                loser = room.current_user_id
                winner = room.guest_user_id if loser == room.host_user_id else room.host_user_id
                gs_dict = mp._finish_by_forfeit(room, winner, now)
                await mp._record_stats(session, room)
                rtdb_to_sync.append((room.room_id, await mp._player_uids(session, room), gs_dict))
            counts["active_forfeited"] = len(stale_active)

            # 3. Nœuds RTDB des parties terminées (fenêtre d'un jour : au-delà,
            #    ils ont déjà été supprimés par un passage précédent)
            finished_recent = (await session.execute(
                select(MultiplayerGame.room_id).where(
                    MultiplayerGame.status == RoomStatus.FINISHED.value,
                    MultiplayerGame.finished_at < now - RTDB_GRACE,
                    MultiplayerGame.finished_at >= now - RTDB_GRACE - timedelta(days=1),
                )
            )).scalars().all()
            rtdb_to_delete.extend(finished_recent)
            counts["rtdb_cleared"] = len(finished_recent)

            # 4. Vieilles parties terminées
            result = await session.execute(
                delete(MultiplayerGame).where(and_(
                    MultiplayerGame.status == RoomStatus.FINISHED.value,
                    MultiplayerGame.finished_at < now - FINISHED_RETENTION,
                ))
            )
            counts["finished_deleted"] = result.rowcount or 0

    # Firebase après la validation en base
    for room_id, players, gs_dict in rtdb_to_sync:
        await asyncio.to_thread(mp._sync_rtdb, room_id, players, gs_dict)
        push_service.game_update(room_id, players, gs_dict)   # lot 7
    for room_id in rtdb_to_delete:
        await asyncio.to_thread(mp._delete_rtdb, room_id)
    await remove_notifications(stale_invites)

    if any(counts.values()):
        logger.info("Nettoyage multijoueur : %s", counts)
    return counts


async def run_cleanup_loop() -> None:
    """Tâche de fond lancée par le lifespan de l'application."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_S)
        try:
            await cleanup_rooms()
        except Exception as exc:  # la boucle ne doit jamais s'arrêter
            logger.warning("Nettoyage multijoueur en échec : %s", exc)
