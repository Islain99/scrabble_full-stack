# tests/test_friends.py
#
# Amis, demandes, groupes et blocages (app/friends, lot 4), et salle
# « Amis seulement » (multijoueur). Base SQLite en mémoire, utilisateur choisi
# par le test, écritures Firebase capturées.
#
import pytest

from app.auth.dependencies import get_current_user
from app.db import database as db
from app.db.models import GameHistory, User
from app.friends import router as friends_router
from app.friends.codes import code_prefix, normalize_code
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.multiplayer import router as mp_router
from app.multiplayer.models import MultiplayerGame
from app.notifications.models import GameInvitation

pytestmark = pytest.mark.anyio

API = "/api/v2"


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (User, GameHistory, MultiplayerGame, Friendship, FriendGroup, FriendGroupMember, UserBlock, GameInvitation):
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
            for name in ("Alice", "Bruno", "Carl", "Alix"):
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
def rtdb(monkeypatch):
    """Copie Firebase des listes d'amis : {uid: {uid_ami: True}}."""
    tree = {}

    def link(a, b, linked):
        for owner, other in ((a, b), (b, a)):
            if linked:
                tree.setdefault(owner, {})[other] = True
            else:
                tree.get(owner, {}).pop(other, None)
    monkeypatch.setattr(friends_router, "_friend_link_write", link)
    monkeypatch.setattr(friends_router, "_friends_write", lambda uid, friends: tree.__setitem__(uid, dict(friends)))
    monkeypatch.setattr(mp_router, "_sync_rtdb", lambda *a, **k: None)
    monkeypatch.setattr(mp_router, "_delete_rtdb", lambda *a, **k: None)
    monkeypatch.setattr(mp_router, "_lobby_write", lambda *a, **k: None)
    return tree


async def _overview(client):
    r = await client.get(f"{API}/friends")
    assert r.status_code == 200, r.text
    return r.json()


async def _befriend(client, login, a, b):
    login(b)
    code = (await _overview(client))["my_code"]
    login(a)
    r = await client.post(f"{API}/friends/requests", json={"friend_code": code})
    assert r.status_code == 200, r.text
    login(b)
    req = (await _overview(client))["incoming"][0]["id"]
    r = await client.post(f"{API}/friends/requests/{req}/accept")
    assert r.status_code == 200, r.text


# ── Code ami ──────────────────────────────────────────────────────

def test_friend_code_format():
    assert code_prefix("Élodie") == "ELOD"
    assert code_prefix("李明") == "JOUE"
    assert code_prefix("Al") == "AL"
    assert normalize_code(" alex 4821 ") == "ALEX-4821"
    assert normalize_code("ALEX-4821") == "ALEX-4821"
    assert normalize_code("Alex") is None


async def test_every_player_gets_a_unique_code(client, login, users, rtdb):
    codes = set()
    for u in users.values():
        login(u)
        codes.add((await _overview(client))["my_code"])
    assert len(codes) == 4
    login(users["alice"])
    assert (await _overview(client))["my_code"] in codes      # stable


# ── Demandes ──────────────────────────────────────────────────────

async def test_request_then_accept(client, login, users, rtdb):
    login(users["bruno"])
    code = (await _overview(client))["my_code"]

    login(users["alice"])
    r = await client.post(f"{API}/friends/requests", json={"friend_code": code.lower().replace("-", " ")})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["user"]["display_name"] == "Bruno"
    assert "email" not in r.json()["user"]
    out = (await _overview(client))["outgoing"]
    assert [q["user"]["display_name"] for q in out] == ["Bruno"]

    login(users["bruno"])
    incoming = (await _overview(client))["incoming"]
    assert [q["user"]["display_name"] for q in incoming] == ["Alice"]
    r = await client.post(f"{API}/friends/requests/{incoming[0]['id']}/accept")
    assert r.json()["status"] == "accepted"

    friends = (await _overview(client))["friends"]
    assert [f["display_name"] for f in friends] == ["Alice"]
    assert friends[0]["firebase_uid"] == "uid-alice"          # pour lire sa présence
    assert rtdb["uid-alice"]["uid-bruno"] is True and rtdb["uid-bruno"]["uid-alice"] is True


async def test_mutual_requests_become_friends(client, login, users, rtdb):
    login(users["bruno"])
    await client.post(f"{API}/friends/requests", json={"user_id": users["alice"].id})
    login(users["alice"])
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    assert r.json()["status"] == "accepted"


async def test_request_errors(client, login, users, rtdb):
    login(users["alice"])
    me = (await _overview(client))["my_code"]
    assert (await client.post(f"{API}/friends/requests", json={"friend_code": me})).status_code == 400
    assert (await client.post(f"{API}/friends/requests", json={"friend_code": "ZZZZ-0000"})).status_code == 404
    assert (await client.post(f"{API}/friends/requests", json={"friend_code": "pas un code"})).status_code == 404
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    assert r.status_code == 409 and "déjà amis" in r.json()["detail"]


async def test_declined_request_still_looks_pending(client, login, users, rtdb):
    login(users["alice"])
    await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    login(users["bruno"])
    req = (await _overview(client))["incoming"][0]["id"]
    assert (await client.post(f"{API}/friends/requests/{req}/decline")).status_code == 204
    assert (await _overview(client))["incoming"] == []

    login(users["alice"])                                      # Alice n'en sait rien
    assert len((await _overview(client))["outgoing"]) == 1
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    assert r.json()["status"] == "pending"                     # et ne peut pas insister
    login(users["bruno"])
    assert (await _overview(client))["incoming"] == []

    # Bruno change d'avis : sa demande à lui est une vraie demande
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["alice"].id})
    assert r.json()["status"] == "pending"
    login(users["alice"])
    assert len((await _overview(client))["incoming"]) == 1


async def test_cancel_and_remove(client, login, users, rtdb):
    login(users["alice"])
    req = (await client.post(f"{API}/friends/requests", json={"user_id": users["carl"].id})).json()["request_id"]
    assert (await client.delete(f"{API}/friends/requests/{req}")).status_code == 204
    login(users["carl"])
    assert (await _overview(client))["incoming"] == []

    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    assert (await client.delete(f"{API}/friends/{users['bruno'].id}")).status_code == 204
    assert (await _overview(client))["friends"] == []
    assert "uid-alice" not in rtdb.get("uid-bruno", {})
    assert (await client.delete(f"{API}/friends/{users['bruno'].id}")).status_code == 404


async def test_hourly_request_limit(client, login, users, rtdb, sqlite_db, monkeypatch):
    monkeypatch.setattr(friends_router, "MAX_SENT_PER_HOUR", 2)
    login(users["alice"])
    for name in ("bruno", "carl"):
        assert (await client.post(f"{API}/friends/requests", json={"user_id": users[name].id})).status_code == 200
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["alix"].id})
    assert r.status_code == 429


# ── Recherche ─────────────────────────────────────────────────────

async def test_search_by_name_and_code(client, login, users, rtdb):
    login(users["bruno"])
    await client.post(f"{API}/friends/requests", json={"user_id": users["alice"].id})

    login(users["alice"])
    r = await client.get(f"{API}/users/search", params={"q": "ali"})
    assert r.status_code == 200
    names = [u["display_name"] for u in r.json()]
    assert names == ["Alix"]                                   # pas soi-même
    assert all("email" not in u and "firebase_uid" not in u for u in r.json())
    assert r.json()[0]["friend_code"]

    r = await client.get(f"{API}/users/search", params={"q": "bru"})
    assert r.json()[0]["relation"] == "incoming"
    code = r.json()[0]["friend_code"]
    r = await client.get(f"{API}/users/search", params={"q": code.lower()})
    assert [u["display_name"] for u in r.json()] == ["Bruno"]
    assert (await client.get(f"{API}/users/search", params={"q": "a"})).status_code == 422


# ── Blocage ───────────────────────────────────────────────────────

async def test_block_ends_friendship_and_hides(client, login, users, rtdb):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    assert (await client.post(f"{API}/users/{users['bruno'].id}/block")).status_code == 204
    ov = await _overview(client)
    assert ov["friends"] == [] and [b["display_name"] for b in ov["blocked"]] == ["Bruno"]
    assert "uid-bruno" not in rtdb.get("uid-alice", {})

    login(users["bruno"])                                      # Bruno ne trouve plus Alice
    assert (await client.get(f"{API}/users/search", params={"q": "alice"})).json() == []
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["alice"].id})
    assert r.status_code == 404

    login(users["alice"])
    r = await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})
    assert r.status_code == 409                                # débloquer d'abord
    assert (await client.delete(f"{API}/users/{users['bruno'].id}/block")).status_code == 204
    assert (await client.post(f"{API}/friends/requests", json={"user_id": users["bruno"].id})).status_code == 200


# ── Groupes ───────────────────────────────────────────────────────

async def test_groups(client, login, users, rtdb):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    r = await client.post(f"{API}/friends/groups", json={"name": "  Club   du jeudi ", "color": "gold"})
    assert r.status_code == 201
    gid = r.json()["id"]
    assert r.json()["name"] == "Club du jeudi"
    assert (await client.post(f"{API}/friends/groups", json={"name": "x", "color": "fuchsia"})).status_code == 422
    assert (await client.post(f"{API}/friends/groups", json={"name": "x" * 31})).status_code == 422

    r = await client.put(f"{API}/friends/groups/{gid}/members", json={"friend_ids": [users["bruno"].id]})
    assert r.json()["member_ids"] == [users["bruno"].id]
    r = await client.put(f"{API}/friends/groups/{gid}/members", json={"friend_ids": [users["carl"].id]})
    assert r.status_code == 422                                # pas un ami

    ov = await _overview(client)
    assert ov["groups"][0]["member_ids"] == [users["bruno"].id]
    assert ov["friends"][0]["group_ids"] == [gid]

    r = await client.patch(f"{API}/friends/groups/{gid}", json={"name": "Jeudi", "color": "plum"})
    assert (r.json()["name"], r.json()["color"]) == ("Jeudi", "plum")

    login(users["bruno"])                                      # privé : invisible pour Bruno
    assert (await _overview(client))["groups"] == []
    assert (await client.delete(f"{API}/friends/groups/{gid}")).status_code == 404

    login(users["alice"])                                      # retirer l'ami le sort des groupes
    await client.delete(f"{API}/friends/{users['bruno'].id}")
    assert (await _overview(client))["groups"][0]["member_ids"] == []
    assert (await client.delete(f"{API}/friends/groups/{gid}")).status_code == 204


# ── Profil public ─────────────────────────────────────────────────

async def test_public_profile_hides_private_fields(client, users, rtdb):
    r = await client.get(f"{API}/users/{users['alice'].id}/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "Alice"
    for private in ("email", "firebase_uid", "age", "first_name", "last_name"):
        assert private not in body


# ── Salle « Amis seulement » ──────────────────────────────────────

async def test_friends_only_room(client, login, users, rtdb):
    await _befriend(client, login, users["alice"], users["bruno"])
    login(users["alice"])
    code = (await client.post(f"{API}/multiplayer/rooms", json={"settings": {"visibility": "friends"}})).json()["room_id"]

    login(users["carl"])
    preview = (await client.get(f"{API}/multiplayer/rooms/{code}/preview")).json()
    assert preview["can_join"] is False and preview["reason"] == "friends_only"
    r = await client.post(f"{API}/multiplayer/rooms/{code}/join")
    assert r.status_code == 403 and "amis" in r.json()["detail"]
    assert code not in [p["room_id"] for p in (await client.get(f"{API}/multiplayer/rooms/public")).json()]

    login(users["bruno"])
    preview = (await client.get(f"{API}/multiplayer/rooms/{code}/preview")).json()
    assert preview["can_join"] is True and preview["reason"] is None
    assert (await client.post(f"{API}/multiplayer/rooms/{code}/join")).status_code == 200


async def test_blocked_player_cannot_join(client, login, users, rtdb):
    login(users["alice"])
    code = (await client.post(f"{API}/multiplayer/rooms")).json()["room_id"]
    await client.post(f"{API}/users/{users['carl'].id}/block")
    login(users["carl"])
    assert (await client.post(f"{API}/multiplayer/rooms/{code}/join")).status_code == 403
