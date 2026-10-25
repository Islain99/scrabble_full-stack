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
from app.db.models import GameHistory, User
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
        await conn.run_sync(GameHistory.__table__.create)

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


# ── R1 : reprise après actualisation ─────────────────────────────

async def test_current_room_lets_both_players_resume(client, login, players, rtdb):
    login(players["alice"])
    assert (await client.get(f"{API}/rooms/current")).json() is None

    room_id = (await client.post(f"{API}/rooms")).json()["room_id"]
    waiting = (await client.get(f"{API}/rooms/current")).json()
    assert waiting["room_id"] == room_id
    assert waiting["status"] == "WAITING"
    assert waiting["host_user_id"] == players["alice"].id

    login(players["bruno"])
    assert (await client.get(f"{API}/rooms/current")).json() is None   # pas sa salle
    await client.post(f"{API}/rooms/{room_id}/join")

    for name, me, other in (("alice", 0, 1), ("bruno", 1, 0)):
        login(players[name])
        room = (await client.get(f"{API}/rooms/current")).json()
        assert room["room_id"] == room_id
        assert room["status"] == "ACTIVE"
        assert room["host_user_id"] == players["alice"].id
        assert room["guest_user_id"] == players["bruno"].id
        assert room["last_action_at"] is not None
        assert "?" not in _letters(room["game_state"]["players"][me]["rack"])
        assert _letters(room["game_state"]["players"][other]["rack"]) == ["?"] * 7


async def test_create_returns_the_room_already_waiting(client, login, players, rtdb):
    """Avant : 409 et aucun moyen d'annuler la salle après une actualisation."""
    login(players["alice"])
    first = await client.post(f"{API}/rooms")
    again = await client.post(f"{API}/rooms")
    assert again.status_code == 201
    assert again.json()["room_id"] == first.json()["room_id"]


async def test_one_game_at_a_time(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    assert (await client.post(f"{API}/rooms")).status_code == 409

    async with sqlite_db() as session:
        async with session.begin():
            carla = User(firebase_uid="uid-carla", email="carla@test.dev", display_name="Carla")
            session.add(carla)
    login(carla)
    other = (await client.post(f"{API}/rooms")).json()["room_id"]
    login(players["bruno"])
    assert (await client.post(f"{API}/rooms/{other}/join")).status_code == 409


async def test_joining_cancels_own_waiting_room(client, login, players, rtdb):
    login(players["bruno"])
    own = (await client.post(f"{API}/rooms")).json()["room_id"]
    login(players["alice"])
    room_id = (await client.post(f"{API}/rooms")).json()["room_id"]

    login(players["bruno"])
    assert (await client.post(f"{API}/rooms/{room_id}/join")).status_code == 200
    assert (await client.get(f"{API}/rooms/{own}")).status_code == 404
    assert own in rtdb["delete"]


# ── R2 : abandon et inactivité ───────────────────────────────────

async def test_resign_gives_the_win_to_the_opponent(client, login, players, rtdb):
    room_id, _ = await _start_game(client, login, players)
    login(players["bruno"])                     # abandon possible hors de son tour
    r = await client.post(f"{API}/rooms/{room_id}/resign")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "FINISHED"
    assert body["winner_user_id"] == players["alice"].id
    assert body["game_state"]["status"] == "FINISHED"
    assert body["game_state"]["winner_name"] == "Alice"

    _, last = rtdb["set"][-1]                   # les deux joueurs voient la fin
    assert last["for_host"]["status"] == "FINISHED"
    assert last["for_guest"]["winner_name"] == "Alice"

    login(players["alice"])
    assert (await client.post(f"{API}/rooms/{room_id}/pass")).status_code == 409
    assert (await client.post(f"{API}/rooms/{room_id}/resign")).status_code == 409
    assert (await client.get(f"{API}/rooms/current")).json() is None
    assert (await client.post(f"{API}/rooms")).status_code == 201     # libre de rejouer


async def test_claim_win_only_after_the_delay(client, login, players, rtdb, monkeypatch):
    from datetime import datetime, timezone
    room_id, _ = await _start_game(client, login, players)   # c'est à Alice

    login(players["alice"])                     # le joueur au trait ne peut pas réclamer
    assert (await client.post(f"{API}/rooms/{room_id}/claim-win")).status_code == 409

    login(players["bruno"])
    r = await client.post(f"{API}/rooms/{room_id}/claim-win")
    assert r.status_code == 409                 # trop tôt
    assert "s pour jouer" in r.json()["detail"]

    later = datetime.now(timezone.utc) + mp_router.CLAIM_AFTER + mp_router.timedelta(seconds=5)
    monkeypatch.setattr(mp_router, "_utcnow", lambda: later)
    r = await client.post(f"{API}/rooms/{room_id}/claim-win")
    assert r.status_code == 200, r.text
    assert r.json()["winner_user_id"] == players["bruno"].id
    assert r.json()["game_state"]["winner_name"] == "Bruno"


async def test_a_move_resets_the_inactivity_delay(client, login, players, rtdb, monkeypatch):
    from datetime import datetime, timezone
    room_id, _ = await _start_game(client, login, players)
    later = datetime.now(timezone.utc) + mp_router.CLAIM_AFTER + mp_router.timedelta(seconds=5)
    monkeypatch.setattr(mp_router, "_utcnow", lambda: later)

    login(players["alice"])                     # Alice joue (tard) : le délai repart
    assert (await client.post(f"{API}/rooms/{room_id}/pass")).status_code == 200
    login(players["alice"])                     # c'est à Bruno : Alice doit attendre
    assert (await client.post(f"{API}/rooms/{room_id}/claim-win")).status_code == 409


# ── R2 : nettoyage ───────────────────────────────────────────────

async def test_cleanup(client, login, players, rtdb, sqlite_db):
    from datetime import datetime, timezone
    from app.multiplayer.cleanup import ACTIVE_TTL, cleanup_rooms

    room_id, _ = await _start_game(client, login, players)           # en cours, au tour d'Alice
    async with sqlite_db() as session:
        async with session.begin():
            carla = User(firebase_uid="uid-carla", email="carla@test.dev", display_name="Carla")
            session.add(carla)
    login(carla)
    waiting_id = (await client.post(f"{API}/rooms")).json()["room_id"]

    # Rien à faire tout de suite
    assert not any((await cleanup_rooms()).values())

    # Un jour plus tard : salle en attente supprimée, partie abandonnée par Alice
    later = datetime.now(timezone.utc) + ACTIVE_TTL + mp_router.timedelta(minutes=1)
    counts = await cleanup_rooms(now=later)
    assert counts["waiting_deleted"] == 1
    assert counts["active_forfeited"] == 1
    assert waiting_id in rtdb["delete"]

    login(players["bruno"])
    room = (await client.get(f"{API}/rooms/{room_id}")).json()
    assert room["status"] == "FINISHED"
    assert room["winner_user_id"] == players["bruno"].id
    assert room["game_state"]["winner_name"] == "Bruno"
    assert rtdb["set"][-1][1]["for_guest"]["status"] == "FINISHED"

    # 20 min après la fin : nœud RTDB supprimé ; 31 jours après : salle supprimée
    counts = await cleanup_rooms(now=later + mp_router.timedelta(minutes=20))
    assert counts["rtdb_cleared"] == 1 and room_id in rtdb["delete"]
    counts = await cleanup_rooms(now=later + mp_router.timedelta(days=31))
    assert counts["finished_deleted"] == 1
    assert (await client.get(f"{API}/rooms/{room_id}")).status_code == 404


# ── F1 : gagnant par identifiant, égalité, fin par passes ────────

async def _set_scores(sessions, room_id, host_score, guest_score, racks=("E", "E")):
    from sqlalchemy import select
    from api.models import POINTS_LETTRES
    async with sessions() as session:
        async with session.begin():
            room = (await session.execute(
                select(MultiplayerGame).where(MultiplayerGame.room_id == room_id)
            )).scalar_one()
            state = dict(room.game_state)
            state["players"] = [dict(p) for p in state["players"]]
            for p, score, letters in zip(state["players"], (host_score, guest_score), racks):
                p["score"] = score
                p["rack"] = [{"letter": l, "score": POINTS_LETTRES.get(l, 0)} for l in letters]
            room.game_state = state


async def test_homonyms_get_the_right_result(client, login, sqlite_db, rtdb):
    async with sqlite_db() as session:
        async with session.begin():
            host  = User(firebase_uid="uid-a1", email="a1@test.dev", display_name="Alex")
            guest = User(firebase_uid="uid-a2", email="a2@test.dev", display_name="Alex")
            session.add_all([host, guest])
    room_id, _ = await _start_game(client, login, {"alice": host, "bruno": guest})
    await _set_scores(sqlite_db, room_id, 5, 30)

    r = None
    for i in range(6):
        login((host, guest)[i % 2])
        r = await client.post(f"{API}/rooms/{room_id}/pass")
        assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "FINISHED"
    assert body["winner_user_id"] == guest.id            # avant : l'hôte (premier « Alex »)
    assert body["game_state"]["winner_id"] == 1
    assert (body["host_score"], body["guest_score"]) == (4, 29)   # chevalets déduits
    assert body["current_user_id"] is None


async def test_tie_has_no_winner(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    await _set_scores(sqlite_db, room_id, 20, 20)
    r = None
    for i in range(6):
        login((players["alice"], players["bruno"])[i % 2])
        r = await client.post(f"{API}/rooms/{room_id}/pass")
    body = r.json()
    assert body["status"] == "FINISHED"
    assert body["winner_user_id"] is None                 # avant : victoire de l'hôte
    assert body["game_state"]["is_draw"] is True
    assert body["game_state"]["winner_name"] is None
    _, last = rtdb["set"][-1]
    assert last["for_guest"]["is_draw"] is True


async def test_forfeit_sets_winner_id(client, login, players, rtdb):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/resign")
    gs = r.json()["game_state"]
    assert gs["winner_id"] == 1 and gs["is_draw"] is False


# ── C1 : code de salle court ─────────────────────────────────────

async def test_room_code_is_short_and_forgiving(client, login, players, rtdb):
    login(players["alice"])
    code = (await client.post(f"{API}/rooms")).json()["room_id"]
    assert len(code) == mp_router.ROOM_CODE_LENGTH
    assert all(ch in mp_router.ROOM_CODE_ALPHABET for ch in code)
    assert not set(code) & set("0O1IL")             # pas de caractères ambigus

    login(players["bruno"])
    typed = f" {code[:3].lower()} {code[3:].lower()} "   # saisi en minuscules, avec espaces
    r = await client.post(f"{API}/rooms/{typed}/join")
    assert r.status_code == 200, r.text
    assert r.json()["room_id"] == code


def test_normalize_room_id_keeps_old_uuids():
    old = "679fcf58-2058-4023-aa94-e5d9806f64fd"
    assert mp_router._normalize_room_id(old) == old
    assert mp_router._normalize_room_id("abc-234") == "ABC234"


# ── C2 : historique et statistiques ──────────────────────────────

async def _history(sessions):
    from sqlalchemy import select
    async with sessions() as session:
        rows = (await session.execute(select(GameHistory).order_by(GameHistory.game_id))).scalars().all()
        users = {u.id: u for u in (await session.execute(select(User))).scalars()}
    return rows, users


async def test_finished_game_counts_for_both_players(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    await _set_scores(sqlite_db, room_id, 12, 30)
    for i in range(6):
        login((players["alice"], players["bruno"])[i % 2])
        await client.post(f"{API}/rooms/{room_id}/pass")

    rows, users = await _history(sqlite_db)
    assert [r.game_id for r in rows] == [f"mp:{room_id}:guest", f"mp:{room_id}:host"]
    by_user = {r.user_id: r for r in rows}
    alice, bruno = players["alice"].id, players["bruno"].id
    assert (by_user[alice].user_score, by_user[alice].ai_score, by_user[alice].won) == (11, 29, False)
    assert (by_user[bruno].ai_name, by_user[bruno].won) == ("Alice", True)
    assert all(r.ai_difficulty == "multiplayer" for r in rows)
    assert (users[alice].games_played, users[alice].games_won) == (1, 0)
    assert (users[bruno].games_played, users[bruno].games_won, users[bruno].best_score) == (1, 1, 29)

    # Une requête de plus sur la partie finie ne compte rien deux fois
    login(players["alice"])
    assert (await client.post(f"{API}/rooms/{room_id}/resign")).status_code == 409
    rows, users = await _history(sqlite_db)
    assert len(rows) == 2 and users[alice].games_played == 1


async def test_forfeits_count_too(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    login(players["bruno"])
    await client.post(f"{API}/rooms/{room_id}/resign")
    rows, users = await _history(sqlite_db)
    assert {r.user_id: r.won for r in rows} == {players["alice"].id: True, players["bruno"].id: False}
    assert users[players["alice"].id].games_won == 1


async def test_cleanup_forfeit_counts(client, login, players, rtdb, sqlite_db):
    from datetime import datetime, timezone
    from app.multiplayer.cleanup import ACTIVE_TTL, cleanup_rooms
    await _start_game(client, login, players)
    await cleanup_rooms(now=datetime.now(timezone.utc) + ACTIVE_TTL + mp_router.timedelta(minutes=1))
    rows, users = await _history(sqlite_db)
    assert len(rows) == 2
    assert users[players["bruno"].id].games_won == 1      # Alice était au trait
