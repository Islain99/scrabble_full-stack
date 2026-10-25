# tests/test_multiplayer.py
#
# Routes multijoueur (app/multiplayer/router.py).
#
# Une base SQLite en mémoire remplace PostgreSQL (le type JSON bascule sur
# JSONB sous PostgreSQL) ; l'authentification Firebase est remplacée par un
# utilisateur choisi par le test ; les écritures Firebase RTDB sont capturées.
#
import pytest

from app.auth.dependencies import get_current_user
from app.db import database as db
from app.db.models import User
from app.multiplayer import router as mp_router
from app.multiplayer.models import MultiplayerGame

pytestmark = pytest.mark.anyio

API = "/api/v2/multiplayer"


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(User.__table__.create)
        await conn.run_sync(MultiplayerGame.__table__.create)

    previous = db.AsyncSessionLocal
    db.AsyncSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)
    try:
        yield db.AsyncSessionLocal
    finally:
        db.AsyncSessionLocal = previous
        await test_engine.dispose()


@pytest.fixture
async def players(sqlite_db):
    """Deux comptes : Alice (hôte) et Bruno (invité)."""
    async with sqlite_db() as session:
        async with session.begin():
            alice = User(firebase_uid="uid-alice", email="alice@test.dev", display_name="Alice")
            bruno = User(firebase_uid="uid-bruno", email="bruno@test.dev", display_name="Bruno")
            session.add_all([alice, bruno])
    return {"alice": alice, "bruno": bruno}


@pytest.fixture
def login(app):
    """login(user) : les requêtes suivantes sont faites au nom de cet utilisateur."""
    def _login(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield _login
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def rtdb(monkeypatch):
    """Capture les écritures RTDB au lieu de contacter Firebase."""
    writes = {"set": [], "delete": []}

    def fake_sync(room_id, players, gs_dict=None):
        payload = {"players": players}
        if gs_dict is not None:
            payload["for_host"]  = mp_router._build_masked_state(gs_dict, viewer_index=0)
            payload["for_guest"] = mp_router._build_masked_state(gs_dict, viewer_index=1)
        writes["set"].append((room_id, payload))

    monkeypatch.setattr(mp_router, "_sync_rtdb", fake_sync)
    monkeypatch.setattr(mp_router, "_delete_rtdb", lambda room_id: writes["delete"].append(room_id))
    return writes


async def _start_game(client, login, players):
    login(players["alice"])
    r = await client.post(f"{API}/rooms")
    assert r.status_code == 201, r.text
    room_id = r.json()["room_id"]

    login(players["bruno"])
    r = await client.post(f"{API}/rooms/{room_id}/join")
    assert r.status_code == 200, r.text
    return room_id, r.json()


async def _set_rack(sessions, room_id, player_index, letters):
    """Remplace le chevalet d'un joueur (pour jouer un mot connu)."""
    from sqlalchemy import select
    from api.models import POINTS_LETTRES
    async with sessions() as session:
        async with session.begin():
            room = (await session.execute(
                select(MultiplayerGame).where(MultiplayerGame.room_id == room_id)
            )).scalar_one()
            state = dict(room.game_state)
            state["players"] = [dict(p) for p in state["players"]]
            state["players"][player_index]["rack"] = [
                {"letter": l, "score": POINTS_LETTRES.get(l, 0)} for l in letters
            ]
            room.game_state = state


def _letters(rack):
    return [t["letter"] for t in rack]


# ── S1 : la partie n'est jamais lisible par les routes solo ──────

async def test_game_never_left_in_solo_engine(client, app, login, players, rtdb, sqlite_db):
    engine = app.state.game_engine
    room_id, joined = await _start_game(client, login, players)
    game_id = joined["game_state"]["game_id"]

    assert game_id not in engine.active_games
    r = await client.get(f"/game/status/{game_id}")
    assert r.status_code == 404                     # avant le correctif : 200 + chevalets

    # Après un échange (invité) puis un mot (hôte)
    login(players["alice"])
    await _set_rack(sqlite_db, room_id, 0, "CHATXYZ")
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 7, "c": 7 + i, "letter": l} for i, l in enumerate("CHAT")]})
    assert r.status_code == 200, r.text
    assert game_id not in engine.active_games
    assert (await client.get(f"/game/status/{game_id}")).status_code == 404

    login(players["bruno"])
    rack = _letters(r.json()["game_state"]["players"][1]["rack"])
    assert rack == ["?"] * 7                        # vu par l'hôte : masqué
    r = await client.get(f"{API}/rooms/{room_id}")
    first = r.json()["game_state"]["players"][1]["rack"][0]["letter"]
    r = await client.post(f"{API}/rooms/{room_id}/swap", json={"letters": [first]})
    assert r.status_code == 200, r.text
    assert game_id not in engine.active_games

    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/pass")
    assert r.status_code == 200, r.text
    assert game_id not in engine.active_games
    assert (await client.get(f"/game/status/{game_id}")).status_code == 404


async def test_refused_move_does_not_leak_either(client, app, login, players, rtdb):
    engine = app.state.game_engine
    room_id, joined = await _start_game(client, login, players)
    game_id = joined["game_state"]["game_id"]

    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 0, "c": 0, "letter": "Z"}]})
    assert r.status_code == 422
    assert game_id not in engine.active_games


async def test_moves_are_kept_between_requests(client, login, players, rtdb, sqlite_db):
    """La partie vit en base : retirée du moteur, elle continue normalement."""
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    await _set_rack(sqlite_db, room_id, 0, "CHATXYZ")
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 7, "c": 7 + i, "letter": l} for i, l in enumerate("CHAT")]})
    assert r.status_code == 200, r.text
    score = r.json()["host_score"]
    assert score > 0

    login(players["bruno"])
    r = await client.get(f"{API}/rooms/{room_id}")
    state = r.json()["game_state"]
    assert state["current_player_index"] == 1
    assert state["players"][0]["score"] == score
    assert "".join(state["board"]["grid"][7][7 + i]["letter"] for i in range(4)) == "CHAT"


# ── S2 : nœud RTDB avec les uid des joueurs ──────────────────────

async def test_rtdb_node_names_its_players(client, login, players, rtdb):
    room_id, _ = await _start_game(client, login, players)

    # Création : seul l'hôte est connu, aucun état de partie
    created_room, created = rtdb["set"][0]
    assert created_room == room_id
    assert created == {"players": {"host": "uid-alice"}}

    # Arrivée de l'invité : les deux uid + un état masqué par joueur
    _, joined = rtdb["set"][1]
    assert joined["players"] == {"host": "uid-alice", "guest": "uid-bruno"}
    assert "?" not in _letters(joined["for_host"]["players"][0]["rack"])
    assert _letters(joined["for_host"]["players"][1]["rack"]) == ["?"] * 7
    assert _letters(joined["for_guest"]["players"][0]["rack"]) == ["?"] * 7
    assert "?" not in _letters(joined["for_guest"]["players"][1]["rack"])

    # Chaque action réécrit les uid (le nœud est remplacé en entier)
    login(players["alice"])
    await client.post(f"{API}/rooms/{room_id}/pass")
    _, after_pass = rtdb["set"][-1]
    assert after_pass["players"] == {"host": "uid-alice", "guest": "uid-bruno"}


async def test_cancel_removes_rtdb_node(client, login, players, rtdb):
    login(players["alice"])
    room_id = (await client.post(f"{API}/rooms")).json()["room_id"]
    r = await client.delete(f"{API}/rooms/{room_id}")
    assert r.status_code == 204
    assert rtdb["delete"] == [room_id]


async def test_outsider_cannot_read_room(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    async with sqlite_db() as session:
        async with session.begin():
            carla = User(firebase_uid="uid-carla", email="carla@test.dev", display_name="Carla")
            session.add(carla)
    login(carla)
    assert (await client.get(f"{API}/rooms/{room_id}")).status_code == 403
