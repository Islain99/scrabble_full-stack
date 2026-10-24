# app/solo/store.py
#
# Persistance et nettoyage des parties solo.
#
# Le GameEngine garde les parties en cours en mémoire (rapide pour l'IA).
# Ce module ajoute deux choses autour :
#
#   1. Persistance : chaque coup est enregistré dans la table `solo_games`.
#      Une partie absente de la mémoire (redéploiement, redémarrage, autre
#      instance) est rechargée depuis la base au premier appel.
#
#   2. Nettoyage : une partie terminée quitte la mémoire tout de suite ; une
#      partie inactive en sort après MEMORY_IDLE_TTL (elle reste en base) ;
#      la base est purgée périodiquement des vieilles parties.
#
# Sans base de données (tests, dev sans DATABASE_URL), tout fonctionne en
# mémoire seule, avec un délai d'inactivité plus long avant libération.
#
# La persistance est « au mieux » : une erreur de base est journalisée mais
# ne fait jamais échouer un coup — la partie continue en mémoire.

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import and_, delete, or_

from app.db import database as db
from app.solo.models import SoloGame

if TYPE_CHECKING:
    from api.game_logic import GameEngine
    from api.models import GameState

logger = logging.getLogger(__name__)

# ── Réglages ──────────────────────────────────────────────────────

MEMORY_IDLE_TTL_S      = 30 * 60          # avec base : libère la mémoire après 30 min sans coup
NO_DB_IDLE_TTL_S       = 6 * 60 * 60      # sans base : la partie serait perdue, on attend 6 h
FINISHED_RETENTION     = timedelta(days=1)    # parties terminées gardées 1 jour en base
ABANDONED_RETENTION    = timedelta(days=14)   # parties non terminées sans activité depuis 14 jours
CLEANUP_INTERVAL_S     = 10 * 60          # fréquence du nettoyage


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_finished(game: "GameState") -> bool:
    return getattr(game.status, "value", game.status) == "FINISHED"


class SoloGameStore:
    def __init__(self) -> None:
        # Dernière activité (time.monotonic) de chaque partie en mémoire
        self._last_seen: dict[str, float] = {}

    # ── Lecture ───────────────────────────────────────────────────

    @property
    def db_enabled(self) -> bool:
        return db.AsyncSessionLocal is not None

    def touch(self, game_id: str) -> None:
        self._last_seen[game_id] = time.monotonic()

    async def load(self, engine: "GameEngine", game_id: str) -> Optional["GameState"]:
        """
        Retourne la partie, en la rechargeant depuis la base si elle n'est
        plus en mémoire. None si elle n'existe nulle part.
        """
        game = engine.get_game(game_id)
        if game is not None:
            self.touch(game_id)
            return game
        if not self.db_enabled:
            return None

        try:
            async with db.AsyncSessionLocal() as session:
                row = await session.get(SoloGame, game_id)
        except Exception as exc:
            logger.warning("Lecture de la partie solo %s impossible : %s", game_id, exc)
            return None
        if row is None:
            return None

        from api.models import GameState
        game = GameState.model_validate(row.state)
        if _is_finished(game):
            # Consultation d'une partie terminée : inutile de la remettre en mémoire
            return game
        engine.restore_game(game, row.difficulty)
        self.touch(game_id)
        logger.info("Partie solo %s rechargée depuis la base.", game_id)
        return game

    # ── Écriture ──────────────────────────────────────────────────

    async def save(self, engine: "GameEngine", game: "GameState", difficulty: str) -> None:
        """
        Enregistre l'état courant de la partie. Une partie terminée est
        ensuite retirée de la mémoire : elle n'en a plus besoin.
        """
        finished = _is_finished(game)
        if self.db_enabled:
            try:
                await self._upsert(game, difficulty, finished)
            except Exception as exc:
                logger.warning("Sauvegarde de la partie solo %s impossible : %s", game.game_id, exc)

        if finished:
            self.release(engine, game.game_id)
        else:
            self.touch(game.game_id)

    async def _upsert(self, game: "GameState", difficulty: str, finished: bool) -> None:
        now = _utcnow()
        state = game.model_dump(mode="json")
        status = "FINISHED" if finished else getattr(game.status, "value", str(game.status))
        async with db.AsyncSessionLocal() as session:
            async with session.begin():
                row = await session.get(SoloGame, game.game_id)
                if row is None:
                    session.add(SoloGame(
                        game_id=game.game_id, difficulty=difficulty, status=status,
                        state=state, created_at=now, updated_at=now,
                        finished_at=now if finished else None,
                    ))
                else:
                    row.state = state
                    row.status = status
                    row.difficulty = difficulty
                    row.updated_at = now
                    if finished and row.finished_at is None:
                        row.finished_at = now

    def release(self, engine: "GameEngine", game_id: str) -> None:
        """Retire la partie de la mémoire (elle reste en base si la base est active)."""
        engine.forget_game(game_id)
        self._last_seen.pop(game_id, None)

    # ── Nettoyage ─────────────────────────────────────────────────

    def evict_idle(self, engine: "GameEngine", now: Optional[float] = None) -> list[str]:
        """
        Libère la mémoire des parties sans activité depuis le délai prévu.
        Les parties chargées par d'autres routes (multijoueur) et jamais vues
        ici sont prises en compte à partir de maintenant.
        """
        now = time.monotonic() if now is None else now
        ttl = MEMORY_IDLE_TTL_S if self.db_enabled else NO_DB_IDLE_TTL_S
        evicted = []
        for game_id in list(engine.active_games):
            last = self._last_seen.setdefault(game_id, now)
            if now - last >= ttl:
                self.release(engine, game_id)
                evicted.append(game_id)
        # Oublie les horodatages de parties qui ne sont plus en mémoire
        for game_id in list(self._last_seen):
            if game_id not in engine.active_games:
                self._last_seen.pop(game_id, None)
        return evicted

    async def purge_database(self) -> int:
        """Supprime les parties terminées depuis 1 jour et celles abandonnées depuis 14 jours."""
        if not self.db_enabled:
            return 0
        now = _utcnow()
        stmt = delete(SoloGame).where(or_(
            and_(SoloGame.status == "FINISHED", SoloGame.updated_at < now - FINISHED_RETENTION),
            SoloGame.updated_at < now - ABANDONED_RETENTION,
        ))
        async with db.AsyncSessionLocal() as session:
            async with session.begin():
                result = await session.execute(stmt)
        return result.rowcount or 0

    async def cleanup(self, engine: "GameEngine") -> None:
        evicted = self.evict_idle(engine)
        try:
            purged = await self.purge_database()
        except Exception as exc:
            logger.warning("Purge des parties solo impossible : %s", exc)
            purged = 0
        if evicted or purged:
            logger.info(
                "Nettoyage parties : %d libérée(s) de la mémoire, %d supprimée(s) de la base.",
                len(evicted), purged,
            )

    async def run_cleanup_loop(self, get_engine) -> None:
        """Tâche de fond lancée par le lifespan de l'application."""
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL_S)
            engine = get_engine()
            if engine is None:
                continue
            try:
                await self.cleanup(engine)
            except Exception as exc:  # la boucle ne doit jamais s'arrêter
                logger.warning("Nettoyage des parties en échec : %s", exc)


# Instance unique partagée par les routes /game/* et le lifespan
solo_store = SoloGameStore()
