# tests/test_notifications.py
#
# Invitations à jouer et notifications (app/notifications, lot 5).
# Base SQLite en mémoire, utilisateur choisi par le test, écritures Firebase capturées.
#
import pytest

from app.auth.dependencies import get_current_user
from app.db import database as db
from app.db.models import GameHistory, User
from app.friends import router as friends_router
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.multiplayer import router as mp_router
from app.multiplayer.models import MultiplayerGame
from app.notifications import router as notif_router
from app.notifications import service as notif_service
from app.notifications.models import GameInvitation

pytestmark = pytest.mark.anyio

API = "/api/v2"


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (User, GameHistory, MultiplayerGame, Friendship, FriendGroup, FriendGroupMember,
                      UserBlock, GameInvitation):
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
            for name in ("Alice", "Bruno", "Carl", "Dana"):
                u = User(firebase_uid=f"uid-{name.lower()}", email=f"{name.lower()}@test.dev", display_name=name)
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
def inbox(monkeypatch):
    """Notifications Firebase capturées : {uid: {clé: fiche}}."""
    boxes = {}

    def write(uid, key, payload):
        if payload is None:
            boxes.get(uid, {}).pop(key, None)
        else:
            boxes.setdefault(uid, {})[key] = payload
    monkeypatch.setattr(notif_service, "_notify_write", write)
    for name in ("_friend_link_write", "_friends_write"):
        monkeypatch.setattr(friends_router, name, lambda *a, **k: None)
    for name in ("_sync_rtdb", "_delete_rtdb", "_lobby_write"):
        monkeypatch.setattr(mp_router, name, lambda *a, **k: None)
    return boxes


async def _befriend(client, login, a, b):
    login(a)
    r = await client.post(f"{API}/friends/requests", json={"user_id": b.id})
    login(b)
    r = await client.post(f"{API}/friends/requests/{r.json()['request_id']}/accept")
    assert r.status_code == 200, r.text


def _invites(box):
    return {k: v for k, v in box.items() if k.startswith("inv-")}


# ── Invitations ───────────────────────────────────────────────────

async def test_invite_then_accept(client, login, users, inbox):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    r = await client.post(f"{API}/friends/{users['bruno'].id}/invite", json={"settings": {"turn_seconds": 60}})
    assert r.status_code == 200, r.text
    invite = r.json()
    room_id = invite["room_id"]

    note = inbox["uid-bruno"][f"inv-{invite['invitation_id']}"]
    assert note["type"] == "game_invite" and note["from_name"] == "Alice"
    assert note["room_id"] == room_id and note["turn_seconds"] == 60
    assert isinstance(note["created_at"], int)

    # Salle d'attente d'Alice, réservée aux amis
    preview = (await client.get(f"{API}/multiplayer/rooms/{room_id}/preview")).json()
    assert preview["status"] == "WAITING"

    login(users["bruno"])
    listed = (await client.get(f"{API}/notifications")).json()
    assert [(n["type"], n["from_name"]) for n in listed] == [("game_invite", "Alice")]
    assert listed[0]["settings"]["turn_seconds"] == 60

    r = await client.post(f"{API}/invitations/{invite['invitation_id']}/accept")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ACTIVE" and r.json()["room_id"] == room_id
    assert _invites(inbox["uid-bruno"]) == {}
    assert (await client.get(f"{API}/notifications")).json() == []

    login(users["alice"])
    statuses = (await client.get(f"{API}/multiplayer/rooms/{room_id}/invitations")).json()
    assert [(s["invitee_name"], s["status"]) for s in statuses] == [("Bruno", "accepted")]


async def test_default_invite_room_is_friends_only(client, login, users, inbox):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    room_id = (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).json()["room_id"]
    login(users["carl"])
    assert (await client.get(f"{API}/multiplayer/rooms/{room_id}/preview")).json()["reason"] == "friends_only"


async def test_only_friends_can_be_invited(client, login, users, inbox):
    login(users["alice"])
    r = await client.post(f"{API}/friends/{users['carl'].id}/invite")
    assert r.status_code == 403
    assert inbox.get("uid-carl") is None


async def test_decline_warns_the_host(client, login, users, inbox):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    invite = (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).json()
    login(users["bruno"])
    assert (await client.post(f"{API}/invitations/{invite['invitation_id']}/decline")).status_code == 204
    assert _invites(inbox["uid-bruno"]) == {}
    note = inbox["uid-alice"][f"invd-{invite['invitation_id']}"]
    assert note["type"] == "invite_declined" and note["from_name"] == "Bruno"

    login(users["alice"])
    statuses = (await client.get(f"{API}/multiplayer/rooms/{invite['room_id']}/invitations")).json()
    assert statuses[0]["status"] == "declined"
    # Fermer l'avis
    assert (await client.delete(f"{API}/notifications/invd-{invite['invitation_id']}")).status_code == 204
    assert f"invd-{invite['invitation_id']}" not in inbox["uid-alice"]
    assert (await client.delete(f"{API}/notifications/../../etc")).status_code in (404, 422)


async def test_invitations_expire_when_the_room_fills(client, login, users, inbox):
    for friend in ("bruno", "carl"):
        await _befriend(client, login, users["alice"], users[friend])
    login(users["alice"])
    to_bruno = (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).json()
    to_carl = (await client.post(f"{API}/friends/{users['carl'].id}/invite")).json()
    assert to_bruno["room_id"] == to_carl["room_id"]          # même salle d'attente
    again = (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).json()
    assert again["invitation_id"] == to_bruno["invitation_id"]  # pas de doublon

    login(users["carl"])
    assert (await client.post(f"{API}/invitations/{to_carl['invitation_id']}/accept")).status_code == 200
    assert _invites(inbox["uid-bruno"]) == {}                   # retirée chez Bruno
    login(users["bruno"])
    r = await client.post(f"{API}/invitations/{to_bruno['invitation_id']}/accept")
    assert r.status_code == 409 and "expiré" in r.json()["detail"]


async def test_cancelled_room_withdraws_invitations(client, login, users, inbox):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    invite = (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).json()
    assert (await client.delete(f"{API}/multiplayer/rooms/{invite['room_id']}")).status_code in (200, 204)
    assert _invites(inbox["uid-bruno"]) == {}
    login(users["bruno"])
    assert (await client.get(f"{API}/notifications")).json() == []


async def test_expired_waiting_room_withdraws_invitations(client, login, users, inbox, sqlite_db):
    from datetime import datetime, timezone
    from app.multiplayer.cleanup import WAITING_TTL, cleanup_rooms
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    await client.post(f"{API}/friends/{users['bruno'].id}/invite")
    await cleanup_rooms(now=datetime.now(timezone.utc) + WAITING_TTL + mp_router.timedelta(minutes=1))
    assert _invites(inbox["uid-bruno"]) == {}


async def test_invite_rate_limit(client, login, users, inbox, monkeypatch):
    monkeypatch.setattr(notif_router, "MAX_INVITES_PER_HOUR", 1)
    for friend in ("bruno", "carl"):
        await _befriend(client, login, users["alice"], users[friend])
    login(users["alice"])
    assert (await client.post(f"{API}/friends/{users['bruno'].id}/invite")).status_code == 200
    assert (await client.post(f"{API}/friends/{users['carl'].id}/invite")).status_code == 429


# ── Demandes d'ami sur le même canal ──────────────────────────────

async def test_friend_requests_are_notified(client, login, users, inbox):
    login(users["alice"])
    req = (await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})).json()["request_id"]
    note = inbox["uid-bruno"][f"fr-{req}"]
    assert note["type"] == "friend_request" and note["from_name"] == "Alice"

    login(users["bruno"])
    listed = (await client.get(f"{API}/notifications")).json()
    assert [(n["type"], n["request_id"]) for n in listed] == [("friend_request", req)]
    await client.post(f"{API}/friends/requests/{req}/accept")
    assert f"fr-{req}" not in inbox["uid-bruno"]
    assert inbox["uid-alice"][f"fra-{req}"]["from_name"] == "Bruno"

    login(users["carl"])                                    # annulée : retirée
    req2 = (await client.post(f"{API}/friends/requests", json={"user_id": users["dana"].id})).json()["request_id"]
    assert f"fr-{req2}" in inbox["uid-dana"]
    await client.delete(f"{API}/friends/requests/{req2}")
    assert f"fr-{req2}" not in inbox["uid-dana"]

    req3 = (await client.post(f"{API}/friends/requests", json={"user_id": users["dana"].id})).json()["request_id"]
    login(users["dana"])                                    # refusée : retirée, sans avis au demandeur
    await client.post(f"{API}/friends/requests/{req3}/decline")
    assert f"fr-{req3}" not in inbox["uid-dana"]
    assert not [k for k in inbox.get("uid-carl", {}) if k.startswith("fra-")]
