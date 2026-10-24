# tests/test_solo_persistence.py
#
# Persistance et nettoyage des parties solo (app/solo/store.py).
#
# Une base SQLite en mémoire remplace PostgreSQL le temps de ces tests
# (même modèle SQLAlchemy ; le type JSON bascule sur JSONB sous PostgreSQL).
#
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.db import database as db
from app.solo.models import SoloGame
from app.solo.store import MEMORY_IDLE_TTL_S, NO_DB_IDLE_TTL_S, solo_store

pytestmark = pytest.mark.anyio


@pytest.fixture
async def sqlite_db():
    """Branche une base SQLite en mémoire à la place de PostgreSQL."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(SoloGame.__table__.create)

    previous = db.AsyncSessionLocal
    db.AsyncSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)
    try:
        yield db.AsyncSessionLocal
    finally:
        db.AsyncSessionLocal = previous
        await test_engine.dispose()


async def _start(client, difficulty="easy"):
    r = await client.post("/game/start", params={"difficulty": difficulty}, json=["Alice", "HAL (IA)"])
    assert r.status_code == 200, r.text
    return r.json()


async def _row(sessions, game_id):
    async with sessions() as session:
        return await session.get(SoloGame, game_id)


# ── Avec base de données ──────────────────────────────────────────

async def test_new_game_is_saved(client, sqlite_db):
    game = await _start(client, difficulty="hard")
    row = await _row(sqlite_db, game["game_id"])
    assert row is not None
    assert row.status == "ACTIVE"
    assert row.difficulty == "hard"
    assert row.state["players"][0]["name"] == "Alice"


async def test_game_survives_server_restart(client, app, sqlite_db):
    """Une partie retirée de la mémoire (redéploiement) est reprise depuis la base."""
    engine = app.state.game_engine
    game = await _start(client)
    game_id = game["game_id"]

    r = await client.post(f"/game/pass/{game_id}", params={"player_id": 0})
    assert r.status_code == 200, r.text
    before = r.json()["game_state"]

    engine.forget_game(game_id)                     # « redémarrage » : la mémoire est vide
    assert engine.get_game(game_id) is None

    r = await client.get(f"/game/status/{game_id}")
    assert r.status_code == 200
    after = r.json()
    assert after["players"] == before["players"]    # mêmes chevalets, mêmes scores
    assert after["current_player_index"] == 1       # c'est toujours au tour de l'IA
    assert engine.get_difficulty(game_id) == "easy" # difficulté restaurée

    # La partie continue normalement : l'IA joue
    r = await client.post(f"/game/ai/play/{game_id}")
    assert r.status_code == 200, r.text
    row = await _row(sqlite_db, game_id)
    assert row.state["current_player_index"] == 0


async def test_finished_game_leaves_memory_but_stays_readable(client, app, sqlite_db):
    engine = app.state.game_engine
    game = await _start(client)
    game_id = game["game_id"]

    r = await client.post(f"/game/abandon/{game_id}", params={"player_id": 0})
    assert r.status_code == 200, r.text
    assert game_id not in engine.active_games       # mémoire libérée

    row = await _row(sqlite_db, game_id)
    assert row.status == "FINISHED"
    assert row.finished_at is not None

    r = await client.get(f"/game/status/{game_id}")  # toujours consultable
    assert r.status_code == 200
    assert r.json()["status"] == "FINISHED"
    assert game_id not in engine.active_games       # sans revenir en mémoire


async def test_idle_game_is_evicted_then_reloaded(client, app, sqlite_db):
    engine = app.state.game_engine
    game = await _start(client)
    game_id = game["game_id"]

    later = solo_store._last_seen[game_id] + MEMORY_IDLE_TTL_S + 1
    assert game_id in solo_store.evict_idle(engine, now=later)
    assert engine.get_game(game_id) is None

    r = await client.get(f"/game/status/{game_id}")
    assert r.status_code == 200
    assert engine.get_game(game_id) is not None


async def test_purge_removes_old_games_only(client, sqlite_db):
    now = datetime.now(timezone.utc)
    rows = {
        "fini-hier":      ("FINISHED", now - timedelta(days=2)),
        "fini-recent":    ("FINISHED", now - timedelta(hours=2)),
        "abandonne-vieux": ("ACTIVE",  now - timedelta(days=20)),
        "en-cours":       ("ACTIVE",   now - timedelta(days=3)),
    }
    async with sqlite_db() as session:
        async with session.begin():
            for game_id, (status, updated) in rows.items():
                session.add(SoloGame(game_id=game_id, difficulty="easy", status=status,
                                     state={}, created_at=updated, updated_at=updated))

    assert await solo_store.purge_database() == 2

    async with sqlite_db() as session:
        left = set((await session.execute(select(SoloGame.game_id))).scalars())
    assert left == {"fini-recent", "en-cours"}


async def test_unknown_game_is_404(client, sqlite_db):
    r = await client.get("/game/status/partie-inexistante")
    assert r.status_code == 404


# ── Sans base de données (dev, tests) ─────────────────────────────

async def test_without_db_finished_game_is_released(client, app):
    assert not solo_store.db_enabled
    engine = app.state.game_engine
    game = await _start(client)
    game_id = game["game_id"]

    r = await client.post(f"/game/abandon/{game_id}", params={"player_id": 0})
    assert r.status_code == 200
    assert game_id not in engine.active_games


async def test_without_db_idle_games_wait_longer(client, app):
    engine = app.state.game_engine
    game = await _start(client)
    game_id = game["game_id"]
    seen = solo_store._last_seen[game_id]

    # 30 min ne suffisent pas sans base (la partie serait perdue)…
    assert game_id not in solo_store.evict_idle(engine, now=seen + MEMORY_IDLE_TTL_S + 1)
    # …6 h, si.
    assert game_id in solo_store.evict_idle(engine, now=seen + NO_DB_IDLE_TTL_S + 1)
