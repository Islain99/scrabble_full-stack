# tests/test_chat.py
#
# Messagerie (app/chat, lot 6) : conversations privées entre amis, groupes,
# salon universel, chat de partie, cadence, filtre, blocages, modération.
# Base SQLite en mémoire, utilisateur choisi par le test, écritures Firebase capturées.
#
from datetime import datetime, timedelta, timezone

import pytest

from app.auth.dependencies import get_current_user
from app.chat import realtime
from app.chat import router as chat_router
from app.chat.models import Conversation, ConversationMember, Message, MessageReport
from app.db import database as db
from app.db.models import GameHistory, User
from app.friends import router as friends_router
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.multiplayer import router as mp_router
from app.multiplayer.models import MultiplayerGame
from app.notifications import service as notif_service
from app.notifications.models import GameInvitation

pytestmark = pytest.mark.anyio

API = "/api/v2"
OLD = datetime.now(timezone.utc) - timedelta(days=10)


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (User, GameHistory, MultiplayerGame, Friendship, FriendGroup, FriendGroupMember, UserBlock,
                      GameInvitation, Conversation, ConversationMember, Message, MessageReport):
            await conn.run_sync(model.__table__.create)
    previous = db.AsyncSessionLocal
    db.AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield db.AsyncSessionLocal
    finally:
        db.AsyncSessionLocal = previous
        await engine.dispose()


@pytest.fixture
async def users(sqlite_db):
    out = {}
    async with sqlite_db() as session:
        async with session.begin():
            for name in ("Alice", "Bruno", "Carl", "Dana", "Eve"):
                u = User(firebase_uid=f"uid-{name.lower()}", email=f"{name.lower()}@test.dev",
                         display_name=name, created_at=OLD, is_admin=(name == "Eve"))
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
    """Base temps réel simulée : {chemin: valeur}."""
    tree = {"chat": {}, "inbox": {}}

    monkeypatch.setattr(realtime, "set_members", lambda key, uids: tree["chat"].setdefault(key, {}).__setitem__("members", set(uids)))

    def push(key, message, drop_id=None):
        msgs = tree["chat"].setdefault(key, {}).setdefault("messages", {})
        msgs[message["id"]] = dict(message)
        if drop_id is not None:
            msgs.pop(drop_id, None)
    monkeypatch.setattr(realtime, "push_message", push)
    monkeypatch.setattr(realtime, "mark_deleted", lambda key, mid: tree["chat"][key]["messages"][mid].update(deleted=True, body=""))

    def inbox(uid, conv_id, entry):
        box = tree["inbox"].setdefault(uid, {})
        if entry is None:
            box.pop(conv_id, None)
        else:
            box[conv_id] = entry
    monkeypatch.setattr(realtime, "set_inbox", inbox)
    monkeypatch.setattr(realtime, "drop_conversation", lambda key: tree["chat"].pop(key, None))
    monkeypatch.setattr(realtime, "_update", lambda *a, **k: None)
    monkeypatch.setattr(chat_router, "MIN_INTERVAL", timedelta(0))     # cadence testée à part
    monkeypatch.setattr(notif_service, "_notify_write", lambda *a, **k: None)
    for name in ("_friend_link_write", "_friends_write"):
        monkeypatch.setattr(friends_router, name, lambda *a, **k: None)
    for name in ("_sync_rtdb", "_delete_rtdb", "_lobby_write"):
        monkeypatch.setattr(mp_router, name, lambda *a, **k: None)
    return tree


async def _befriend(client, login, a, b):
    login(a)
    r = await client.post(f"{API}/friends/requests", json={"user_id": b.id})
    login(b)
    assert (await client.post(f"{API}/friends/requests/{r.json()['request_id']}/accept")).status_code == 200


async def _send(client, conv_id, body):
    return await client.post(f"{API}/chat/conversations/{conv_id}/messages", json={"body": body})


async def _global_id(client):
    convs = (await client.get(f"{API}/chat/conversations")).json()
    return next(c["id"] for c in convs if c["kind"] == "global")


# ── Privé ─────────────────────────────────────────────────────────

async def test_private_messages_between_friends(client, login, users, live):
    login(users["alice"])
    r = await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})
    assert r.status_code == 403                                  # pas encore amis

    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    again = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    assert conv["id"] == again["id"] and conv["title"] == "Bruno" and conv["key"] == str(conv["id"])
    assert live["chat"][conv["key"]]["members"] == {"uid-alice", "uid-bruno"}

    r = await _send(client, conv["id"], "  Salut Bruno !  ")
    assert r.status_code == 201, r.text
    msg = r.json()
    assert msg["body"] == "Salut Bruno !" and msg["author_name"] == "Alice"
    assert live["chat"][conv["key"]]["messages"][msg["id"]]["body"] == "Salut Bruno !"
    assert live["inbox"]["uid-bruno"][conv["id"]]["unread"] == 1
    assert live["inbox"]["uid-bruno"][conv["id"]]["title"] == "Alice"
    assert live["inbox"]["uid-alice"][conv["id"]]["unread"] == 0

    login(users["bruno"])
    listed = (await client.get(f"{API}/chat/conversations")).json()
    assert listed[0]["kind"] == "global"                         # le salon universel en tête
    mine = next(c for c in listed if c["id"] == conv["id"])
    assert mine["unread"] == 1 and mine["last_preview"] == "Alice : Salut Bruno !"
    assert (await client.post(f"{API}/chat/conversations/{conv['id']}/read")).status_code == 204
    assert live["inbox"]["uid-bruno"][conv["id"]]["unread"] == 0

    login(users["carl"])                                         # un tiers ne lit rien
    assert (await client.get(f"{API}/chat/conversations/{conv['id']}/messages")).status_code == 404
    assert (await _send(client, conv["id"], "coucou")).status_code == 404


async def test_private_closed_when_friendship_ends(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    await client.delete(f"{API}/friends/{users['bruno'].id}")
    r = await _send(client, conv["id"], "encore là ?")
    assert r.status_code == 403 and "amis" in r.json()["detail"]


async def test_history_pages(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    for i in range(5):
        assert (await _send(client, conv["id"], f"m{i}")).status_code == 201
    page = (await client.get(f"{API}/chat/conversations/{conv['id']}/messages", params={"limit": 3})).json()
    assert [m["body"] for m in page["messages"]] == ["m2", "m3", "m4"] and page["has_more"] is True
    older = (await client.get(f"{API}/chat/conversations/{conv['id']}/messages",
                              params={"limit": 3, "before": page["messages"][0]["id"]})).json()
    assert [m["body"] for m in older["messages"]] == ["m0", "m1"] and older["has_more"] is False


async def test_live_feed_keeps_the_last_100(client, login, users, live, monkeypatch):
    monkeypatch.setattr(realtime, "LIVE_MESSAGES", 3)
    monkeypatch.setattr(chat_router, "MAX_PER_MINUTE", 100)
    login(users["alice"])
    gid = await _global_id(client)
    for i in range(5):
        await _send(client, gid, f"m{i}")
    assert sorted(m["body"] for m in live["chat"]["global"]["messages"].values()) == ["m2", "m3", "m4"]


# ── Contrôles à l'envoi ──────────────────────────────────────────

async def test_rate_limits(client, login, users, live, monkeypatch):
    login(users["alice"])
    gid = await _global_id(client)
    monkeypatch.setattr(chat_router, "MIN_INTERVAL", timedelta(seconds=2))
    assert (await _send(client, gid, "un")).status_code == 201
    r = await _send(client, gid, "deux")
    assert r.status_code == 429 and "2 secondes" in r.json()["detail"]

    monkeypatch.setattr(chat_router, "MIN_INTERVAL", timedelta(0))
    monkeypatch.setattr(chat_router, "MAX_PER_MINUTE", 2)
    assert (await _send(client, gid, "deux")).status_code == 201
    assert (await _send(client, gid, "trois")).status_code == 429


async def test_body_checks_filter_and_links(client, login, users, live, sqlite_db):
    login(users["alice"])
    gid = await _global_id(client)
    assert (await _send(client, gid, "   ")).status_code == 422
    assert (await _send(client, gid, "x" * 501)).status_code == 422
    r = await _send(client, gid, "Quel PUTAIN de mot, connard !")
    assert r.json()["body"] == "Quel ****** de mot, ******* !"
    assert (await _send(client, gid, "va voir https://exemple.com")).status_code == 201   # compte ancien

    async with sqlite_db() as session:                          # compte de moins de 24 h
        async with session.begin():
            newbie = User(firebase_uid="uid-new", email="new@test.dev", display_name="Newbie",
                          created_at=datetime.now(timezone.utc))
            session.add(newbie)
    login(newbie)
    r = await _send(client, gid, "promo sur www.spam.ru")
    assert r.status_code == 422 and "24 h" in r.json()["detail"]
    assert (await _send(client, gid, "bonjour à tous")).status_code == 201


# ── Salon universel et modération ─────────────────────────────────

async def test_global_room_and_admin_tools(client, login, users, live):
    login(users["dana"])
    gid = await _global_id(client)
    assert (await _send(client, gid, "Bonjour le monde")).status_code == 201
    login(users["carl"])                                        # tout le monde lit le salon
    page = (await client.get(f"{API}/chat/conversations/{gid}/messages")).json()
    assert [m["author_name"] for m in page["messages"]] == ["Dana"]

    # Mode lent : réservé aux administrateurs
    assert (await client.put(f"{API}/chat/admin/global/slow-mode", json={"seconds": 30})).status_code == 403
    login(users["eve"])
    assert (await client.put(f"{API}/chat/admin/global/slow-mode", json={"seconds": 30})).json()["slow_mode_s"] == 30
    login(users["dana"])
    r = await _send(client, gid, "encore")
    assert r.status_code == 429 and "Mode lent" in r.json()["detail"]

    # Sourdine
    login(users["eve"])
    await client.put(f"{API}/chat/admin/global/slow-mode", json={"seconds": 0})
    assert (await client.post(f"{API}/chat/admin/users/{users['carl'].id}/mute", json={"minutes": 15})).status_code == 204
    login(users["carl"])
    r = await _send(client, gid, "je parle")
    assert r.status_code == 403 and "muet" in r.json()["detail"]
    login(users["eve"])
    await client.post(f"{API}/chat/admin/users/{users['carl'].id}/mute", json={"minutes": 0})
    login(users["carl"])
    assert (await _send(client, gid, "je parle")).status_code == 201


async def test_report_and_resolve(client, login, users, live):
    login(users["dana"])
    gid = await _global_id(client)
    bad = (await _send(client, gid, "message déplacé")).json()
    assert (await client.post(f"{API}/chat/messages/{bad['id']}/report", json={"reason": "insulte"})).status_code == 400

    for name in ("carl", "bruno"):
        login(users[name])
        assert (await client.post(f"{API}/chat/messages/{bad['id']}/report", json={"reason": "insulte"})).status_code == 204
    assert (await client.get(f"{API}/chat/admin/reports")).status_code == 403

    login(users["eve"])
    reports = (await client.get(f"{API}/chat/admin/reports")).json()
    assert len(reports) == 1 and reports[0]["reports_count"] == 2
    assert reports[0]["message"]["body"] == "message déplacé" and reports[0]["conversation_kind"] == "global"
    r = await client.post(f"{API}/chat/admin/reports/{reports[0]['id']}/resolve", json={"action": "delete"})
    assert r.status_code == 204
    assert (await client.get(f"{API}/chat/admin/reports")).json() == []
    assert live["chat"]["global"]["messages"][bad["id"]]["deleted"] is True
    page = (await client.get(f"{API}/chat/conversations/{gid}/messages")).json()
    assert page["messages"][0]["deleted"] is True and page["messages"][0]["body"] == ""


async def test_delete_own_message_only(client, login, users, live):
    login(users["dana"])
    gid = await _global_id(client)
    mine = (await _send(client, gid, "oups")).json()
    login(users["carl"])
    assert (await client.delete(f"{API}/chat/messages/{mine['id']}")).status_code == 403
    login(users["dana"])
    assert (await client.delete(f"{API}/chat/messages/{mine['id']}")).status_code == 204


async def test_blocked_authors_are_hidden(client, login, users, live):
    login(users["dana"])
    gid = await _global_id(client)
    await _send(client, gid, "de Dana")
    login(users["carl"])
    await _send(client, gid, "de Carl")
    await client.post(f"{API}/users/{users['dana'].id}/block")
    page = (await client.get(f"{API}/chat/conversations/{gid}/messages")).json()
    assert [m["author_name"] for m in page["messages"]] == ["Carl"]


# ── Groupes ───────────────────────────────────────────────────────

async def test_groups(client, login, users, live):
    for friend in ("bruno", "carl", "dana"):
        await _befriend(client, login, users["alice"], users[friend])
    login(users["alice"])
    r = await client.post(f"{API}/chat/conversations/group", json={"name": "Club", "member_ids": [users["bruno"].id]})
    assert r.status_code == 422                                  # 3 personnes au moins
    r = await client.post(f"{API}/chat/conversations/group", json={"name": "Club", "member_ids": [users["bruno"].id, users["eve"].id]})
    assert r.status_code == 403                                  # Eve n'est pas une amie
    r = await client.post(f"{API}/chat/conversations/group",
                          json={"name": "  Club   du jeudi ", "member_ids": [users["bruno"].id, users["carl"].id]})
    assert r.status_code == 201, r.text
    group = r.json()
    assert group["title"] == "Club du jeudi" and group["my_role"] == "owner"
    assert {m["display_name"] for m in group["members"]} == {"Alice", "Bruno", "Carl"}
    assert live["inbox"]["uid-bruno"][group["id"]]["title"] == "Club du jeudi"

    login(users["bruno"])                                        # un membre écrit, ne gère pas
    assert (await _send(client, group["id"], "Salut le club")).status_code == 201
    assert live["inbox"]["uid-carl"][group["id"]]["unread"] == 1
    assert (await client.patch(f"{API}/chat/conversations/{group['id']}", json={"name": "X"})).status_code == 403

    login(users["alice"])
    assert (await client.patch(f"{API}/chat/conversations/{group['id']}", json={"name": "Jeudi"})).json()["title"] == "Jeudi"
    r = await client.post(f"{API}/chat/conversations/{group['id']}/members", json={"user_ids": [users["dana"].id]})
    assert len(r.json()["members"]) == 4
    assert (await client.delete(f"{API}/chat/conversations/{group['id']}/members/{users['dana'].id}")).status_code == 204
    assert group["id"] not in live["inbox"].get("uid-dana", {})

    # La créatrice s'en va : le plus ancien membre reprend le groupe
    assert (await client.delete(f"{API}/chat/conversations/{group['id']}/members/{users['alice'].id}")).status_code == 204
    login(users["bruno"])
    conv = next(c for c in (await client.get(f"{API}/chat/conversations")).json() if c["id"] == group["id"])
    assert conv["my_role"] == "owner" and len(conv["members"]) == 2


async def test_mute_conversation(client, login, users, live):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    conv = (await client.post(f"{API}/chat/conversations/private", json={"user_id": users["bruno"].id})).json()
    login(users["bruno"])
    r = await client.post(f"{API}/chat/conversations/{conv['id']}/mute", json={"muted": True})
    assert r.json()["muted"] is True
    login(users["alice"])
    await _send(client, conv["id"], "tu dors ?")
    assert live["inbox"]["uid-bruno"][conv["id"]]["muted"] is True


# ── Chat de partie ────────────────────────────────────────────────

async def test_game_chat(client, login, users, live):
    login(users["alice"])
    room = (await client.post(f"{API}/multiplayer/rooms")).json()["room_id"]
    assert (await client.get(f"{API}/chat/rooms/{room}")).status_code == 404    # pas encore d'adversaire
    login(users["carl"])
    await client.post(f"{API}/multiplayer/rooms/{room}/join")
    conv = (await client.get(f"{API}/chat/rooms/{room}")).json()
    assert conv["kind"] == "game" and conv["title"] == f"Partie {room}"
    assert (await _send(client, conv["id"], "bonne partie !")).status_code == 201
    login(users["alice"])
    assert (await client.get(f"{API}/chat/rooms/{room}")).json()["id"] == conv["id"]
    login(users["dana"])
    assert (await client.get(f"{API}/chat/rooms/{room}")).status_code == 404


# ── Nettoyage ─────────────────────────────────────────────────────

async def test_cleanup(client, login, users, live, sqlite_db):
    from sqlalchemy import delete, select, update
    from app.chat.cleanup import cleanup_chat
    login(users["dana"])
    gid = await _global_id(client)
    old = (await _send(client, gid, "vieux")).json()
    login(users["alice"])
    room = (await client.post(f"{API}/multiplayer/rooms")).json()["room_id"]
    login(users["carl"])
    await client.post(f"{API}/multiplayer/rooms/{room}/join")
    conv = (await client.get(f"{API}/chat/rooms/{room}")).json()
    async with sqlite_db() as session:
        async with session.begin():
            await session.execute(update(Message).where(Message.id == old["id"])
                                  .values(created_at=datetime.now(timezone.utc) - timedelta(days=31)))
            await session.execute(delete(MultiplayerGame).where(MultiplayerGame.room_id == room))
    counts = await cleanup_chat()
    assert counts == {"global_messages": 1, "game_conversations": 1}
    async with sqlite_db() as session:
        assert (await session.execute(select(Conversation).where(Conversation.id == conv["id"]))).first() is None
