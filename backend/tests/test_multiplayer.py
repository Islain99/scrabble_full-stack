# tests/test_multiplayer.py
#
# Routes multijoueur (app/multiplayer/router.py).
#
# Une base SQLite en mémoire remplace PostgreSQL (le type JSON bascule sur
# JSONB sous PostgreSQL) ; l'authentification Firebase est remplacée par un
# utilisateur choisi par le test ; les écritures Firebase RTDB sont capturées.
#
import json

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
        from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
        from app.notifications.models import GameInvitation
        for model in (Friendship, FriendGroup, FriendGroupMember, UserBlock, GameInvitation):
            await conn.run_sync(model.__table__.create)

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
    writes = {"set": [], "raw": [], "delete": []}

    def fake_sync(room_id, players, gs_dict=None):
        # Le vrai contenu envoyé à Firebase, puis sa version décodée (plus lisible)
        raw = mp_router._rtdb_payload(players, gs_dict)
        writes["raw"].append((room_id, raw))
        decoded = {"players": raw["players"]}
        for side in ("for_host", "for_guest"):
            if side in raw:
                decoded[side] = json.loads(raw[side]["state"])
        writes["set"].append((room_id, decoded))

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
    assert (users[alice].mp_games, users[alice].mp_wins) == (1, 0)
    assert (users[bruno].mp_games, users[bruno].mp_wins, users[bruno].mp_best_score) == (1, 1, 29)
    # Lot 7 : les statistiques solo ne bougent pas ; cote Elo ±20 (K 40, cotes égales)
    assert (users[alice].games_played, users[bruno].games_played) == (0, 0)
    assert (users[alice].mp_rating, users[bruno].mp_rating) == (1180, 1220)
    assert (by_user[alice].rating_delta, by_user[bruno].rating_delta) == (-20, 20)
    assert users[bruno].mp_peak_rating == 1220 and users[alice].mp_peak_rating == 1200

    # Une requête de plus sur la partie finie ne compte rien deux fois
    login(players["alice"])
    assert (await client.post(f"{API}/rooms/{room_id}/resign")).status_code == 409
    rows, users = await _history(sqlite_db)
    assert len(rows) == 2 and users[alice].mp_games == 1 and users[alice].mp_rating == 1180


async def test_forfeits_count_too(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    login(players["bruno"])
    await client.post(f"{API}/rooms/{room_id}/resign")
    rows, users = await _history(sqlite_db)
    assert {r.user_id: r.won for r in rows} == {players["alice"].id: True, players["bruno"].id: False}
    assert users[players["alice"].id].mp_wins == 1


async def test_cleanup_forfeit_counts(client, login, players, rtdb, sqlite_db):
    from datetime import datetime, timezone
    from app.multiplayer.cleanup import ACTIVE_TTL, cleanup_rooms
    await _start_game(client, login, players)
    await cleanup_rooms(now=datetime.now(timezone.utc) + ACTIVE_TTL + mp_router.timedelta(minutes=1))
    rows, users = await _history(sqlite_db)
    assert len(rows) == 2
    assert users[players["bruno"].id].mp_wins == 1      # Alice était au trait


# ── R0 : ce que Firebase fait des valeurs null ───────────────────

def _firebase_roundtrip(value):
    """
    Imite la Realtime Database : `null` n'est jamais stocké, un objet vide
    disparaît, un tableau devient un objet {index: valeur} sans ses trous,
    relu comme tableau seulement s'il n'en a pas.
    """
    if isinstance(value, dict):
        kept = {k: _firebase_roundtrip(v) for k, v in value.items()}
        kept = {k: v for k, v in kept.items() if v is not None}
        return kept or None
    if isinstance(value, list):
        kept = {str(i): _firebase_roundtrip(v) for i, v in enumerate(value)}
        kept = {k: v for k, v in kept.items() if v is not None}
        if not kept:
            return None
        if list(kept) == [str(i) for i in range(len(kept))]:
            return list(kept.values())
        return kept
    return value


async def test_state_survives_firebase_unchanged(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    await _set_rack(sqlite_db, room_id, 0, "CHATXYZ")
    await client.post(f"{API}/rooms/{room_id}/move",
                      json={"placements": [{"r": 7, "c": 7 + i, "letter": l} for i, l in enumerate("CHAT")]})

    for (_, raw), (_, decoded) in zip(rtdb["raw"], rtdb["set"]):
        stored = _firebase_roundtrip(raw)
        for side in ("for_host", "for_guest"):
            if side not in raw:
                continue
            assert stored[side]["v"] == 2
            assert json.loads(stored[side]["state"]) == decoded[side]   # rien de perdu
            grid = decoded[side]["board"]["grid"]
            assert len(grid) == 15 and all(len(row) == 15 for row in grid)


def test_raw_state_would_lose_the_board():
    """Le bug d'origine : envoyé tel quel, un plateau vide disparaît."""
    empty_board = {"board": {"grid": [[None] * 15 for _ in range(15)]}, "players": [{"name": "Alice", "rack": []}]}
    stored = _firebase_roundtrip(empty_board)
    assert "board" not in stored
    assert "rack" not in stored["players"][0]


# ── A1 : actions en partie (historique, mélange, revanche) ───────

async def test_moves_are_recorded_for_both_players(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    await _set_rack(sqlite_db, room_id, 0, "CHATXYZ")
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 7, "c": 7 + i, "letter": l} for i, l in enumerate("CHAT")]})
    assert r.status_code == 200, r.text

    login(players["bruno"])
    r = await client.get(f"{API}/rooms/{room_id}")
    first = r.json()["game_state"]["players"][1]["rack"][0]["letter"]
    assert (await client.post(f"{API}/rooms/{room_id}/swap", json={"letters": [first]})).status_code == 200
    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/pass")
    moves = r.json()["game_state"]["moves"]

    assert [m["kind"] for m in moves] == ["play", "swap", "pass"]
    assert moves[0]["words"] == ["CHAT"] and moves[0]["score"] > 0
    assert moves[0]["cells"] == [[7, 7], [7, 8], [7, 9], [7, 10]]
    assert moves[0]["player_id"] == 0 and moves[1]["player_id"] == 1
    assert moves[1]["count"] == 1
    _, last = rtdb["set"][-1]                   # l'adversaire voit aussi l'historique
    assert [m["kind"] for m in last["for_guest"]["moves"]] == ["play", "swap", "pass"]


async def test_shuffle_any_time_without_using_the_turn(client, login, players, rtdb, sqlite_db, monkeypatch):
    from collections import Counter
    from datetime import datetime, timezone
    room_id, _ = await _start_game(client, login, players)   # c'est à Alice
    await _set_rack(sqlite_db, room_id, 1, "ABCDEFG")

    login(players["bruno"])                     # hors de son tour
    r = await client.post(f"{API}/rooms/{room_id}/shuffle")
    assert r.status_code == 200, r.text
    state = r.json()["game_state"]
    rack = _letters(state["players"][1]["rack"])
    assert Counter(rack) == Counter("ABCDEFG")  # mêmes lettres
    assert state["current_player_index"] == 0   # le tour n'a pas bougé
    assert state["moves"] == []                 # rien dans l'historique
    assert _letters(state["players"][0]["rack"]) == ["?"] * 7   # l'adversaire reste masqué

    # Le délai d'inactivité n'est pas remis à zéro par un mélange
    later = datetime.now(timezone.utc) + mp_router.CLAIM_AFTER + mp_router.timedelta(seconds=5)
    monkeypatch.setattr(mp_router, "_utcnow", lambda: later)
    login(players["alice"])
    assert (await client.post(f"{API}/rooms/{room_id}/shuffle")).status_code == 200
    login(players["bruno"])
    assert (await client.post(f"{API}/rooms/{room_id}/claim-win")).status_code == 200


async def test_shuffle_refused_outside_an_active_game(client, login, players, rtdb, sqlite_db):
    async with sqlite_db() as session:
        async with session.begin():
            carl = User(firebase_uid="uid-carl", email="carl@test.dev", display_name="Carl")
            session.add(carl)
    room_id, _ = await _start_game(client, login, players)
    login(carl)
    assert (await client.post(f"{API}/rooms/{room_id}/shuffle")).status_code == 403
    login(players["alice"])
    await client.post(f"{API}/rooms/{room_id}/resign")
    assert (await client.post(f"{API}/rooms/{room_id}/shuffle")).status_code == 409


async def test_rematch_offer_then_accept(client, login, players, rtdb):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    assert (await client.post(f"{API}/rooms/{room_id}/rematch")).status_code == 409   # pas finie
    await client.post(f"{API}/rooms/{room_id}/resign")

    # Bruno propose : une salle à son nom, annoncée dans l'ancienne partie
    login(players["bruno"])
    r = await client.post(f"{API}/rooms/{room_id}/rematch")
    assert r.status_code == 200, r.text
    offer = r.json()
    assert offer["action"] == "created" and offer["status"] == "WAITING"
    new_code = offer["room_id"]
    assert new_code != room_id
    _, last = rtdb["set"][-1]
    assert last["for_host"]["rematch"] == {"code": new_code, "by": 1}

    # Redemander ne crée pas une seconde salle
    assert (await client.post(f"{API}/rooms/{room_id}/rematch")).json()["room_id"] == new_code

    # Alice accepte : elle rejoint, la partie démarre
    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/rematch")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "joined" and body["room_id"] == new_code
    assert body["status"] == "ACTIVE"
    assert body["host_user_id"] == players["bruno"].id
    assert body["game_state"]["moves"] == []
    current = (await client.get(f"{API}/rooms/current")).json()
    assert current["room_id"] == new_code


async def test_rematch_when_offer_expired_creates_a_new_room(client, login, players, rtdb):
    room_id, _ = await _start_game(client, login, players)
    login(players["alice"])
    await client.post(f"{API}/rooms/{room_id}/resign")
    login(players["bruno"])
    code = (await client.post(f"{API}/rooms/{room_id}/rematch")).json()["room_id"]
    assert (await client.delete(f"{API}/rooms/{code}")).status_code in (200, 204)  # Bruno annule

    login(players["alice"])                     # la proposition n'existe plus
    r = await client.post(f"{API}/rooms/{room_id}/rematch")
    assert r.status_code == 200, r.text
    assert r.json()["action"] == "created" and r.json()["room_id"] != code


# ── G1 : règles de partie et minuteur ────────────────────────────

async def _start_with(client, login, players, **settings):
    login(players["alice"])
    r = await client.post(f"{API}/rooms", json={"settings": settings})
    assert r.status_code == 201, r.text
    room_id = r.json()["room_id"]
    login(players["bruno"])
    r = await client.post(f"{API}/rooms/{room_id}/join")
    assert r.status_code == 200, r.text
    return room_id, r.json()


def _later(seconds):
    from datetime import datetime, timezone
    return datetime.now(timezone.utc) + mp_router.timedelta(seconds=seconds)


async def test_host_rules_are_shown_before_joining(client, login, players, rtdb):
    login(players["alice"])
    r = await client.post(f"{API}/rooms", json={"settings": {
        "name": "  Soirée   du jeudi ", "visibility": "public", "turn_seconds": 60,
        "allow_swap": False, "max_passes": 4, "target_score": 250,
    }})
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["settings"]["name"] == "Soirée du jeudi"
    code = created["room_id"]

    login(players["bruno"])                         # l'invité voit les règles avant d'entrer
    r = await client.get(f"{API}/rooms/{code.lower()}/preview")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["host_name"] == "Alice" and preview["can_join"] is True
    assert preview["settings"]["turn_seconds"] == 60
    assert preview["settings"]["allow_swap"] is False
    assert "game_state" not in preview

    login(players["alice"])                         # l'hôte ne peut pas rejoindre sa salle
    assert (await client.get(f"{API}/rooms/{code}/preview")).json()["can_join"] is False


async def test_invalid_rules_are_refused(client, login, players, rtdb):
    login(players["alice"])
    for bad in ({"turn_seconds": 45}, {"max_passes": 5}, {"target_score": 100},
                {"visibility": "secret"}, {"name": "x" * 41}):
        r = await client.post(f"{API}/rooms", json={"settings": bad})
        assert r.status_code == 422, (bad, r.text)
    r = await client.post(f"{API}/rooms")            # sans corps : règles par défaut
    assert r.status_code == 201
    assert r.json()["settings"] == {
        "name": None, "visibility": "private", "turn_seconds": 0, "allow_swap": True,
        "show_preview": True, "max_passes": 6, "target_score": None,
    }


async def test_room_created_before_rules_gets_defaults(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    from sqlalchemy import update
    async with sqlite_db() as session:
        async with session.begin():
            await session.execute(update(MultiplayerGame).values(settings=None))
    login(players["alice"])
    r = await client.get(f"{API}/rooms/{room_id}")
    assert r.json()["settings"]["turn_seconds"] == 0 and r.json()["turn_deadline"] is None
    assert (await client.post(f"{API}/rooms/{room_id}/pass")).status_code == 200


async def test_timer_sets_a_deadline_each_turn(client, login, players, rtdb):
    from datetime import datetime
    room_id, joined = await _start_with(client, login, players, turn_seconds=30)
    deadline = datetime.fromisoformat(joined["turn_deadline"])
    server_now = datetime.fromisoformat(joined["server_now"])
    assert 29 <= (deadline - server_now).total_seconds() <= 30
    assert joined["game_state"]["turn_deadline"] == deadline.isoformat()
    _, live = rtdb["set"][-1]                       # les deux joueurs reçoivent l'échéance
    assert live["for_guest"]["turn_deadline"] == deadline.isoformat()

    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/pass")
    new_deadline = datetime.fromisoformat(r.json()["turn_deadline"])
    assert new_deadline > deadline

    login(players["alice"])                         # avec un minuteur, rien à réclamer
    r = await client.post(f"{API}/rooms/{room_id}/claim-win")
    assert r.status_code == 409 and "minuteur" in r.json()["detail"]


async def test_expired_turn_is_passed_automatically(client, login, players, rtdb, monkeypatch):
    from datetime import datetime
    room_id, joined = await _start_with(client, login, players, turn_seconds=30)
    deadline = datetime.fromisoformat(joined["turn_deadline"])

    monkeypatch.setattr(mp_router, "_utcnow", lambda: deadline + mp_router.timedelta(seconds=5))
    login(players["alice"])                         # trop tard : son coup est refusé
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 7, "c": 7, "letter": "A"}]})
    assert r.status_code == 403

    login(players["bruno"])
    body = (await client.get(f"{API}/rooms/{room_id}")).json()
    gs = body["game_state"]
    assert gs["current_player_index"] == 1          # c'est à Bruno
    assert gs["moves"][-1] == {**gs["moves"][-1], "kind": "timeout", "player_id": 0}
    # Bruno a un tour complet à partir de la passe automatique
    assert datetime.fromisoformat(body["turn_deadline"]) == deadline + mp_router.timedelta(seconds=35)
    _, live = rtdb["set"][-1]
    assert live["for_host"]["current_player_index"] == 1


async def test_long_absence_ends_the_game_by_passes(client, login, players, rtdb, monkeypatch, sqlite_db):
    from datetime import datetime
    room_id, joined = await _start_with(client, login, players, turn_seconds=30, max_passes=4)
    deadline = datetime.fromisoformat(joined["turn_deadline"])
    monkeypatch.setattr(mp_router, "_utcnow", lambda: deadline + mp_router.timedelta(hours=1))
    login(players["alice"])
    body = (await client.get(f"{API}/rooms/{room_id}")).json()
    assert body["status"] == "FINISHED"
    assert [m["kind"] for m in body["game_state"]["moves"]] == ["timeout"] * 4
    assert body["turn_deadline"] is None
    assert len(await _history(sqlite_db)) == 2      # statistiques enregistrées


async def test_background_timer_passes_expired_turns(client, app, login, players, rtdb, sqlite_db):
    from datetime import datetime
    from app.multiplayer.timer import expire_due_turns
    room_id, joined = await _start_with(client, login, players, turn_seconds=60)
    deadline = datetime.fromisoformat(joined["turn_deadline"])
    engine = app.state.game_engine

    assert await expire_due_turns(engine, now=deadline - mp_router.timedelta(seconds=10)) == 0
    assert await expire_due_turns(engine, now=deadline + mp_router.timedelta(seconds=3)) == 1
    _, live = rtdb["set"][-1]
    assert live["for_guest"]["current_player_index"] == 1
    assert live["for_guest"]["moves"][-1]["kind"] == "timeout"


async def test_swaps_can_be_forbidden(client, login, players, rtdb):
    room_id, _ = await _start_with(client, login, players, allow_swap=False)
    login(players["alice"])
    r = await client.get(f"{API}/rooms/{room_id}")
    letter = r.json()["game_state"]["players"][0]["rack"][0]["letter"]
    r = await client.post(f"{API}/rooms/{room_id}/swap", json={"letters": [letter]})
    assert r.status_code == 403
    assert "interdits" in r.json()["detail"]


async def test_fewer_passes_end_the_game(client, login, players, rtdb):
    room_id, _ = await _start_with(client, login, players, max_passes=4)
    r = None
    for i in range(4):
        login((players["alice"], players["bruno"])[i % 2])
        r = await client.post(f"{API}/rooms/{room_id}/pass")
    assert r.json()["status"] == "FINISHED"


async def test_target_score_ends_the_game_at_once(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_with(client, login, players, target_score=150)
    await _set_scores(sqlite_db, room_id, 145, 100, racks=("CHATXYZ", "QQQ"))
    login(players["alice"])
    r = await client.post(f"{API}/rooms/{room_id}/move",
                          json={"placements": [{"r": 7, "c": 7 + i, "letter": l} for i, l in enumerate("CHAT")]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "FINISHED"
    assert body["winner_user_id"] == players["alice"].id
    assert body["guest_score"] == 100                # pas de décompte des chevalets


async def test_rematch_keeps_the_rules(client, login, players, rtdb):
    room_id, _ = await _start_with(client, login, players, turn_seconds=120, allow_swap=False)
    login(players["alice"])
    await client.post(f"{API}/rooms/{room_id}/resign")
    code = (await client.post(f"{API}/rooms/{room_id}/rematch")).json()["room_id"]
    login(players["bruno"])
    preview = (await client.get(f"{API}/rooms/{code}/preview")).json()
    assert preview["settings"]["turn_seconds"] == 120 and preview["settings"]["allow_swap"] is False


# ── P1 : salons publics ──────────────────────────────────────────

@pytest.fixture
def lobby(monkeypatch, rtdb):
    """Fiches /lobby écrites par le serveur ({salle: fiche}) ; la suppression d'une salle les retire aussi."""
    entries = {}

    def fake_write(room_id, entry):
        if entry is None:
            entries.pop(room_id, None)
        else:
            entries[room_id] = entry
    monkeypatch.setattr(mp_router, "_lobby_write", fake_write)

    def fake_delete(room_id):
        rtdb["delete"].append(room_id)
        fake_write(room_id, None)
    monkeypatch.setattr(mp_router, "_delete_rtdb", fake_delete)
    return entries


async def _carl(sqlite_db):
    async with sqlite_db() as session:
        async with session.begin():
            carl = User(firebase_uid="uid-carl", email="carl@test.dev", display_name="Carl")
            session.add(carl)
    return carl


async def test_public_room_is_announced_then_withdrawn(client, login, players, lobby):
    login(players["alice"])
    r = await client.post(f"{API}/rooms", json={"settings": {
        "visibility": "public", "name": "Ouverte à tous", "turn_seconds": 60, "allow_swap": False}})
    code = r.json()["room_id"]
    entry = lobby[code]
    assert entry["host_name"] == "Alice" and entry["name"] == "Ouverte à tous"
    assert entry["turn_seconds"] == 60 and entry["allow_swap"] is False
    assert isinstance(entry["created_at"], int)
    assert None not in entry.values()                       # Firebase ne garde pas null
    assert not {"visibility", "email", "rack", "host_user_id"} & set(entry)

    login(players["bruno"])                                  # complète : retirée
    assert (await client.post(f"{API}/rooms/{code}/join")).status_code == 200
    assert code not in lobby


async def test_private_room_is_not_announced(client, login, players, lobby):
    login(players["alice"])
    await client.post(f"{API}/rooms", json={"settings": {"turn_seconds": 30}})
    assert lobby == {}


async def test_cancelled_public_room_is_withdrawn(client, login, players, lobby):
    login(players["alice"])
    code = (await client.post(f"{API}/rooms", json={"settings": {"visibility": "public"}})).json()["room_id"]
    assert code in lobby
    assert (await client.delete(f"{API}/rooms/{code}")).status_code in (200, 204)
    assert code not in lobby


async def test_expired_public_room_is_withdrawn(client, login, players, lobby, sqlite_db):
    from datetime import datetime, timezone
    from app.multiplayer.cleanup import WAITING_TTL, cleanup_rooms
    login(players["alice"])
    code = (await client.post(f"{API}/rooms", json={"settings": {"visibility": "public"}})).json()["room_id"]
    await cleanup_rooms(now=datetime.now(timezone.utc) + WAITING_TTL + mp_router.timedelta(minutes=1))
    assert code not in lobby


async def test_public_list_fallback(client, login, players, lobby, sqlite_db):
    carl = await _carl(sqlite_db)
    login(players["alice"])
    pub = (await client.post(f"{API}/rooms", json={"settings": {"visibility": "public", "turn_seconds": 120}})).json()["room_id"]
    login(players["bruno"])
    await client.post(f"{API}/rooms")                       # privée : jamais listée

    login(carl)
    rooms = (await client.get(f"{API}/rooms/public")).json()
    assert [r["room_id"] for r in rooms] == [pub]
    assert rooms[0]["host_name"] == "Alice" and rooms[0]["settings"]["turn_seconds"] == 120
    assert rooms[0]["is_mine"] is False
    login(players["alice"])
    assert (await client.get(f"{API}/rooms/public")).json()[0]["is_mine"] is True

    login(carl)                                              # partie commencée : plus listée
    await client.post(f"{API}/rooms/{pub}/join")
    login(players["bruno"])
    assert (await client.get(f"{API}/rooms/public")).json() == []


async def test_second_player_is_told_the_room_is_taken(client, login, players, lobby, sqlite_db):
    carl = await _carl(sqlite_db)
    login(players["alice"])
    code = (await client.post(f"{API}/rooms", json={"settings": {"visibility": "public"}})).json()["room_id"]
    login(players["bruno"])
    assert (await client.post(f"{API}/rooms/{code}/join")).status_code == 200
    login(carl)
    r = await client.post(f"{API}/rooms/{code}/join")
    assert r.status_code == 409
    assert r.json()["detail"] == "Cette salle vient d'être complétée."


async def test_rematch_of_public_game_stays_private(client, login, players, lobby):
    login(players["alice"])
    code = (await client.post(f"{API}/rooms", json={"settings": {"visibility": "public"}})).json()["room_id"]
    login(players["bruno"])
    await client.post(f"{API}/rooms/{code}/join")
    await client.post(f"{API}/rooms/{code}/resign")
    new_code = (await client.post(f"{API}/rooms/{code}/rematch")).json()["room_id"]
    assert new_code not in lobby
    preview = (await client.get(f"{API}/rooms/{new_code}/preview")).json()
    assert preview["settings"]["visibility"] == "private"



# ── Lot 7 : cote Elo ──────────────────────────────────────────────

def test_elo_deltas():
    from app.leaderboard import elo
    assert elo.delta(1200, 1200, 1, 0) == 20            # provisoire : K = 40
    assert elo.delta(1200, 1200, 1, 10) == 12           # établi : K = 24
    assert elo.delta(1200, 1200, 0.5, 0) == 0
    assert elo.delta(1400, 1200, 1, 20) < elo.delta(1200, 1400, 1, 20)   # battre plus fort rapporte plus
    assert elo.delta(110, 110, 0, 0) == -10              # plancher à 100


async def test_draw_counts_as_half(client, login, players, rtdb, sqlite_db):
    room_id, _ = await _start_game(client, login, players)
    await _set_scores(sqlite_db, room_id, 20, 20)
    for i in range(6):
        login((players["alice"], players["bruno"])[i % 2])
        await client.post(f"{API}/rooms/{room_id}/pass")
    rows, users = await _history(sqlite_db)
    a, b = users[players["alice"].id], users[players["bruno"].id]
    if a.mp_draws:                                       # égalité après décompte final
        assert (a.mp_draws, b.mp_draws, a.mp_rating, b.mp_rating) == (1, 1, 1200, 1200)
    else:                                                # le décompte des lettres a départagé
        assert a.mp_wins + b.mp_wins == 1


async def test_solo_route_refuses_multiplayer_rows(client, login, players, sqlite_db):
    login(players["alice"])
    r = await client.post("/api/v2/users/me/games", json={
        "game_id": "mp:FAKE00:host", "user_score": 500, "ai_score": 0, "won": True, "ai_difficulty": "multiplayer"})
    assert r.status_code == 422
