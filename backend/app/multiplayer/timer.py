# app/multiplayer/timer.py
#
# Minuteur des parties multijoueur (G1), tenu par le serveur : un minuteur
# seulement affiché se contournerait en fermant l'onglet.
#
# Toutes les TIMER_INTERVAL_S secondes, les parties dont l'échéance du tour
# (turn_deadline) est dépassée reçoivent une passe automatique, puis le nouvel
# état est poussé aux deux joueurs. Les lignes sont prises avec
# FOR UPDATE SKIP LOCKED : sans danger avec plusieurs instances du serveur, et
# une salle déjà verrouillée par une requête (coup en cours) est laissée à
# cette requête, qui vérifie elle-même l'échéance.
#
# Au mieux : une erreur est journalisée, jamais propagée.

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from sqlalchemy import select

from app.db import database as db
from app.multiplayer.models import MultiplayerGame, RoomStatus
from app.push import service as push_service

logger = logging.getLogger(__name__)

TIMER_INTERVAL_S = 3
BATCH_SIZE       = 50


async def expire_due_turns(engine, now: Optional[datetime] = None) -> int:
    """Un passage : passes automatiques sur les tours expirés. Retourne le nombre de salles traitées."""
    from app.multiplayer import router as mp

    if db.AsyncSessionLocal is None or engine is None:
        return 0
    now = now or datetime.now(timezone.utc)
    to_sync: list[tuple[str, dict, dict]] = []

    async with db.AsyncSessionLocal() as session:
        async with session.begin():
            rooms = (await session.execute(
                select(MultiplayerGame)
                .where(
                    MultiplayerGame.status == RoomStatus.ACTIVE.value,
                    MultiplayerGame.turn_deadline.is_not(None),
                    MultiplayerGame.turn_deadline <= now - mp.DEADLINE_GRACE,
                )
                .order_by(MultiplayerGame.turn_deadline)
                .limit(BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )).scalars().all()

            for room in rooms:
                gs_dict = mp._expire_turns(room, engine, now)
                if gs_dict is None:
                    continue
                await mp._record_stats(session, room)   # C2 (si la partie est finie)
                to_sync.append((room.room_id, await mp._player_uids(session, room), gs_dict))

    # Firebase après la validation en base
    for room_id, players, gs_dict in to_sync:
        await asyncio.to_thread(mp._sync_rtdb, room_id, players, gs_dict)
        push_service.game_update(room_id, players, gs_dict)   # lot 7
    if to_sync:
        logger.info("Minuteur : %d tour(s) expiré(s)", len(to_sync))
    return len(to_sync)


async def run_timer_loop(get_engine: Callable[[], object]) -> None:
    """Tâche de fond lancée par le lifespan de l'application."""
    while True:
        await asyncio.sleep(TIMER_INTERVAL_S)
        try:
            await expire_due_turns(get_engine())
        except Exception as exc:  # la boucle ne doit jamais s'arrêter
            logger.warning("Minuteur multijoueur en échec : %s", exc)
