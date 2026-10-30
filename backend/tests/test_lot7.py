# tests/test_lot7.py
#
# Lot 7 : appels allégés (liste d'amis, blocages, non-lus), classement
# multijoueur séparé, notifications push, export et suppression du compte.
# Base SQLite en mémoire (clés étrangères actives : les cascades sont testées),
# utilisateur choisi par le test, écritures Firebase capturées.
#
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event, select

from app.account import service as account_service
from app.auth.dependencies import get_current_user
from app.chat import realtime
from app.chat import router as chat_router
from app.chat.models import Conversation, ConversationMember, Message, MessageReport
from app.db import database as db
from app.db.models import GameHistory, User
from app.friends import router as friends_router
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.leaderboard import router as lb_router
from app.multiplayer import router as mp_router
from app.multiplayer.models import MultiplayerGame
from app.notifications import service as notif_service
from app.notifications.models import GameInvitation
from app.push import service as push_service
from app.push.models import PushToken

pytestmark = pytest.mark.anyio

API = "/api/v2"
OLD = datetime.now(timezone.utc) - timedelta(days=10)
MODELS = (User, GameHistory, MultiplayerGame, Friendship, FriendGroup, FriendGroupMember, UserBlock,
          GameInvitation, Conversation, ConversationMember, Message, MessageReport, PushToken)


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def _fk_on(dbapi_conn, _):                     # ON DELETE CASCADE, comme PostgreSQL
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    async with engine.begin() as conn:
        for model in MODELS:
            await conn.run_sync(model.__table__.create)
    previous = db.AsyncSessionLocal
    db.AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield db.AsyncSessionLocal
    finally:
        await push_service.drain()
        db.AsyncSessionLocal = previous
        await engine.dispose()


@pytest.fixture
async def users(sqlite_db):
    out = {}
    async with sqlite_db() as session:
        async with session.begin():
            for name in ("Alice", "Bruno", "Carl", "Dana"):
                u = User(firebase_uid=f"uid-{name.lower()}", email=f"{name.lower()}@test.dev",
                         display_name=name, created_at=OLD)
                session.add(u)
                out[name.lower()] = u
    return out


@pytest.fixture
def login(app):
    def _login(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield _login
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def live(monkeypatch):
    """Firebase simulé : temps réel, push, Authentication."""
    tree = {"inbox": {}, "root": {}, "pushed": [], "auth_deleted": [], "friends": {}}

    def inbox(uid, conv_id, entry):
        box = tree["inbox"].setdefault(uid, {})
        if entry is None:
            box.pop(conv_id, None)
        else:
            box[conv_id] = entry
    monkeypatch.setattr(realtime, "set_inbox", inbox)
    monkeypatch.setattr(realtime, "set_inboxes", lambda cid, entries: [inbox(u, cid, e) for u, e in entries.items()])
    for name in ("set_members", "push_message", "mark_deleted", "drop_conversation", "_update"):
        monkeypatch.setattr(realtime, name, lambda *a, **k: None)
    monkeypatch.setattr(chat_router, "MIN_INTERVAL", timedelta(0))
    monkeypatch.setattr(notif_service, "_notify_write", lambda *a, **k: None)
    monkeypatch.setattr(friends_router, "_friend_link_write", lambda *a, **k: None)
    monkeypatch.setattr(friends_router, "_friends_write",
                        lambda uid, friends: tree["friends"].__setitem__(uid, tree["friends"].get(uid, 0) + 1))
    for name in ("_sync_rtdb", "_delete_rtdb", "_lobby_write"):
        monkeypatch.setattr(mp_router, name, lambda *a, **k: None)
    monkeypatch.setattr(account_service, "rtdb_update", lambda values: tree["root"].update(values))
    monkeypatch.setattr(account_service, "delete_auth_user", lambda uid: tree["auth_deleted"].append(uid) or True)

    # Push : Firebase « initialisé », envois capturés ; le jeton « stale-… » est périmé
    monkeypatch.setattr(push_service, "_enabled", lambda: True)
    push_service._recent.clear()

    def send(messages):
        tree["pushed"].extend(messages)
        return [m["token"] for m in messages if m["token"].startswith("stale-")]
    monkeypatch.setattr(push_service, "_send", send)
    return tree


async def _befriend(client, login, a, b):
    login(a)
    r = await client.post(f"{API}/friends/requests", json={"user_id": b.id})
    login(b)
    assert (await client.post(f"{API}/friends/requests/{r.json()['request_id']}/accept")).status_code == 200


async def _register(client, login, user, token, locale="fr", platform="web"):
    login(user)
    r = await client.post(f"{API}/push/tokens", json={"token": token, "platform": platform, "locale": locale})
    assert r.status_code == 204, r.text


# ── Appels allégés ────────────────────────────────────────────────

async def test_light_friend_list_and_blocks(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    await _befriend(client, login, users["alice"], users["carl"])
    login(users["alice"])
    lst = (await client.get(f"{API}/friends/list")).json()
    assert [f["display_name"] for f in lst] == ["Bruno", "Carl"]
    assert set(lst[0]) == {"user_id", "display_name", "avatar_url", "firebase_uid"}

    assert (await client.get(f"{API}/users/me/blocks")).json() == {"blocked_ids": []}
    await client.post(f"{API}/users/{users['dana'].id}/block")
    assert (await client.get(f"{API}/users/me/blocks")).json() == {"blocked_ids": [users["dana"].id]}


async def test_friends_mirror_written_only_when_changed(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    for _ in range(3):
        assert (await client.get(f"{API}/friends")).status_code == 200
    assert live["friends"]["uid-alice"] == 1               # une écriture, pas trois
    await _befriend(client, login, users["alice"], users["carl"])
    login(users["alice"])
    await client.get(f"{API}/friends")
    assert live["friends"]["uid-alice"] == 2               # la liste a changé : recopiée


async def test_group_unread_counts_in_one_pass(client, login, users, live):
    for other in ("bruno", "carl", "dana"):
        await _befriend(client, login, users["alice"], users[other])
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/group", json={
        "name": "Club", "member_ids": [users[n].id for n in ("bruno", "carl", "dana")]})).json()
    for i in range(3):
        assert (await client.post(f"{API}/chat/conversations/{conv['id']}/messages", json={"body": f"m{i}"})).status_code == 201
    assert {u: live["inbox"][u][conv["id"]]["unread"] for u in ("uid-alice", "uid-bruno", "uid-carl")} == \
        {"uid-alice": 0, "uid-bruno": 3, "uid-carl": 3}
    login(users["bruno"])
    await client.post(f"{API}/chat/conversations/{conv['id']}/read")
    listed = {c["id"]: c for c in (await client.get(f"{API}/chat/conversations")).json()}
    assert listed[conv["id"]]["unread"] == 0 and listed[conv["id"]]["last_preview"] == "Alice : m2"
    assert [m["display_name"] for m in listed[conv["id"]]["members"]][0] == "Alice"


# ── Classement multijoueur ────────────────────────────────────────

async def test_leaderboard_modes_are_separate(client, users, sqlite_db):
    lb_router._cache.clear()
    async with sqlite_db() as session:
        async with session.begin():
            rows = {u.display_name: u for u in (await session.execute(select(User))).scalars()}
            rows["Alice"].games_played, rows["Alice"].best_score = 3, 400        # solo seulement
            rows["Bruno"].mp_games, rows["Bruno"].mp_wins, rows["Bruno"].mp_rating = 5, 4, 1260
            rows["Carl"].mp_games, rows["Carl"].mp_wins, rows["Carl"].mp_rating = 5, 1, 1150
            rows["Carl"].mp_best_score = 380
    solo = (await client.get(f"{API}/leaderboard")).json()
    assert solo["mode"] == "solo" and [e["display_name"] for e in solo["entries"]] == ["Alice"]

    multi = (await client.get(f"{API}/leaderboard", params={"mode": "multi"})).json()
    assert multi["sort_by"] == "rating"                          # tri par défaut du mode
    assert [(e["display_name"], e["rating"], e["games_won"]) for e in multi["entries"]] == \
        [("Bruno", 1260, 4), ("Carl", 1150, 1)]
    assert multi["entries"][0]["win_rate"] == 80.0 and multi["total_players"] == 2

    best = (await client.get(f"{API}/leaderboard", params={"mode": "multi", "sort_by": "best_score"})).json()
    assert best["entries"][0]["display_name"] == "Carl"
    # Un tri solo demandé en multijoueur retombe sur la cote
    avg = (await client.get(f"{API}/leaderboard", params={"mode": "multi", "sort_by": "average_score"})).json()
    assert avg["sort_by"] == "rating"


# ── Notifications push ────────────────────────────────────────────

async def test_push_on_friend_request_respects_preferences(client, login, users, live, sqlite_db):
    await _register(client, login, users["bruno"], "tok-bruno-web", locale="en")
    await _register(client, login, users["bruno"], "stale-bruno-old")
    login(users["alice"])
    await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    await push_service.drain()
    got = {m["token"]: m for m in live["pushed"]}
    assert got["tok-bruno-web"]["title"] == "Friend request"
    assert got["tok-bruno-web"]["body"] == "Alice wants to add you as a friend."
    assert got["tok-bruno-web"]["data"]["url"] == "#/friends"
    async with sqlite_db() as session:                          # le jeton périmé est supprimé
        tokens = (await session.execute(select(PushToken.token))).scalars().all()
    assert tokens == ["tok-bruno-web"]

    # Bruno coupe la catégorie « amis » : plus rien
    live["pushed"].clear()
    login(users["bruno"])
    assert (await client.put(f"{API}/users/me/preferences", json={"pushFriends": False})).json()["pushFriends"] is False
    async with sqlite_db() as session:          # (l'utilisateur du test est détaché : on enregistre à la main)
        async with session.begin():
            b = await session.get(User, users["bruno"].id)
            b.game_preferences = {**b.get_preferences(), "pushFriends": False}
    login(users["carl"])
    await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    await push_service.drain()
    assert live["pushed"] == []


async def test_token_moves_to_new_account_and_can_be_removed(client, login, users, live, sqlite_db):
    await _register(client, login, users["alice"], "tok-shared")
    await _register(client, login, users["bruno"], "tok-shared")
    async with sqlite_db() as session:
        owner = (await session.execute(select(PushToken.user_id))).scalars().all()
    assert owner == [users["bruno"].id]
    login(users["alice"])                                        # pas le sien : rien ne bouge
    await client.request("DELETE", f"{API}/push/tokens", json={"token": "tok-shared"})
    login(users["bruno"])
    assert (await client.post(f"{API}/push/test")).json() == {"devices": 1}
    await push_service.drain()
    assert live["pushed"][-1]["title"] == "Notifications activées"
    await client.request("DELETE", f"{API}/push/tokens", json={"token": "tok-shared"})
    async with sqlite_db() as session:
        assert (await session.execute(select(PushToken))).first() is None


async def test_message_push_skips_author_and_muted(client, login, users, live):
    for other in ("bruno", "carl"):
        await _befriend(client, login, users["alice"], users[other])
        await _register(client, login, users[other], f"tok-{other}")
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/group", json={
        "name": "Club", "member_ids": [users["bruno"].id, users["carl"].id]})).json()
    login(users["carl"])
    await client.post(f"{API}/chat/conversations/{conv['id']}/mute", json={"muted": True})
    login(users["alice"])
    await client.post(f"{API}/chat/conversations/{conv['id']}/messages", json={"body": "On joue ce soir ?"})
    await push_service.drain()
    assert [(m["token"], m["title"], m["body"]) for m in live["pushed"]] == \
        [("tok-bruno", "Club", "Alice : On joue ce soir ?")]
    assert live["pushed"][0]["data"]["url"] == f"#/messages?c={conv['id']}"

    # Deuxième message dans la minute : pas de nouvelle notification (anti-rafale)
    await client.post(f"{API}/chat/conversations/{conv['id']}/messages", json={"body": "?"})
    await push_service.drain()
    assert len(live["pushed"]) == 1

    # Conversation privée : le titre est l'auteur, le texte le message seul
    login(users["alice"])
    priv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    await client.post(f"{API}/chat/conversations/{priv['id']}/messages", json={"body": "Salut"})
    await push_service.drain()
    assert (live["pushed"][-1]["title"], live["pushed"][-1]["body"]) == ("Alice", "Salut")


def test_game_update_messages(monkeypatch):
    sent = []
    monkeypatch.setattr(push_service, "_enabled", lambda: True)
    monkeypatch.setattr(push_service, "push", lambda uids, category, kind, params=None, url="#/", tag=None, per_uid=None:
                        sent.append((list(uids), kind, params, tag, per_uid)))
    players = {"host": "uid-a", "guest": "uid-b"}
    gs = {"status": "ACTIVE", "current_player_index": 1,
          "players": [{"id": "p1", "name": "Alice", "score": 30}, {"id": "p2", "name": "Bruno", "score": 12}]}
    push_service.game_update("ROOM01", players, gs)
    assert sent[-1][:4] == (["uid-b"], "your_turn", {"name": "Alice"}, "turn-ROOM01")
    push_service.game_update("ROOM01", players, gs, event="start")
    assert sent[-1][:4] == (["uid-a"], "game_started", {"name": "Bruno"}, "start-ROOM01")
    push_service.game_update("ROOM01", players, {**gs, "status": "FINISHED", "winner_id": "p1"})
    per = sent[-1][4]
    assert per["uid-a"]["_kind"] == "game_won" and per["uid-b"]["_kind"] == "game_lost"
    assert (per["uid-b"]["me"], per["uid-b"]["them"]) == (12, 30)


def test_push_texts_render_in_both_languages():
    from app.push.messages import render
    assert render("game_invite", "fr", {"name": "Alice"}) == ("Invitation à jouer", "Alice vous invite à une partie de Scrabble.")
    assert render("game_won", "en", {"name": "Bruno", "me": 300, "them": 250})[1] == "You beat Bruno 300–250."
    assert render("your_turn", "de", {})[0] == "À vous de jouer"     # langue inconnue → français


# ── Export ────────────────────────────────────────────────────────

async def test_export_contains_my_data(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    priv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    await client.post(f"{API}/chat/conversations/{priv['id']}/messages", json={"body": "Mon message"})
    await client.post(f"{API}/users/{users['carl'].id}/block")
    r = await client.get(f"{API}/users/me/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["profile"]["email"] == "alice@test.dev" and data["profile"]["display_name"] == "Alice"
    assert data["friends"] == [{"user": "Bruno", "status": "friend", "since": data["friends"][0]["since"]}]
    assert data["blocked_players"] == ["Carl"]
    assert [m["body"] for m in data["messages_written"]] == ["Mon message"]
    assert "mp_rating" in data["statistics"] and "pushMessages" in data["preferences"]
    assert (await client.get(f"{API}/users/me/export")).status_code == 429     # pas deux de suite


# ── Suppression du compte ─────────────────────────────────────────

async def test_delete_account(client, login, users, live, sqlite_db):
    alice, bruno, carl = users["alice"], users["bruno"], users["carl"]
    await _befriend(client, login, alice, bruno)
    await _befriend(client, login, alice, carl)
    await _befriend(client, login, bruno, carl)
    await _register(client, login, alice, "tok-alice")

    # Une partie en cours entre Alice et Bruno
    login(alice)
    room_id = (await client.post(f"{API}/multiplayer/rooms")).json()["room_id"]
    login(bruno)
    assert (await client.post(f"{API}/multiplayer/rooms/{room_id}/join")).status_code == 200

    # Messagerie : privé Alice–Bruno, groupe créé par Alice, un message dans le salon universel
    login(alice)
    priv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": bruno.id})).json()
    await client.post(f"{API}/chat/conversations/{priv['id']}/messages", json={"body": "secret"})
    group = (await client.post(f"{API}/chat/conversations/group", json={
        "name": "Trio", "member_ids": [bruno.id, carl.id]})).json()
    await client.post(f"{API}/chat/conversations/{group['id']}/messages", json={"body": "bienvenue"})
    glob = next(c for c in (await client.get(f"{API}/chat/conversations")).json() if c["kind"] == "global")
    gmsg = (await client.post(f"{API}/chat/conversations/{glob['id']}/messages", json={"body": "bonjour à tous"})).json()

    r = await client.request("DELETE", f"{API}/users/me", json={"confirm_name": "alice x"})
    assert r.status_code == 422                                  # pseudo mal retapé
    r = await client.request("DELETE", f"{API}/users/me", json={"confirm_name": " alice "})
    assert r.status_code == 204, r.text

    async with sqlite_db() as session:
        names = (await session.execute(select(User.display_name))).scalars().all()
        assert "Alice" not in names
        assert (await session.execute(select(MultiplayerGame))).first() is None
        assert (await session.execute(select(PushToken))).first() is None
        assert (await session.execute(select(Friendship).where(
            (Friendship.requester_id == alice.id) | (Friendship.addressee_id == alice.id)))).first() is None
        assert await session.get(Conversation, priv["id"]) is None           # privé : supprimé
        kept = await session.get(Conversation, group["id"])                  # groupe : transmis
        roles = dict((await session.execute(select(ConversationMember.user_id, ConversationMember.role)
                                            .where(ConversationMember.conversation_id == group["id"]))).all())
        assert kept is not None and roles == {bruno.id: "owner", carl.id: "member"}
        assert (await session.execute(select(Message).where(Message.author_id == alice.id))).first() is None
        b = await session.get(User, bruno.id)
        hist = (await session.execute(select(GameHistory).where(GameHistory.user_id == bruno.id))).scalars().all()
        assert b.mp_wins == 1 and [h.won for h in hist] == [True]             # abandon : Bruno gagne

    root = live["root"]
    for path in ("presence/uid-alice", "friends/uid-alice", "notifications/uid-alice", "inbox/uid-alice",
                 "friends/uid-bruno/uid-alice", "friends/uid-carl/uid-alice",
                 f"chat/global/messages/{gmsg['id']}", f"chat/{priv['key']}", f"inbox/uid-bruno/{priv['id']}"):
        assert path in root and root[path] is None, path
    assert live["auth_deleted"] == ["uid-alice"]
