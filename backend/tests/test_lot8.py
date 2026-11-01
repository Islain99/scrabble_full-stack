# tests/test_lot8.py
#
# Lot 8 : complétion du profil (prénom, nom, âge, pays) et réglages de
# confidentialité (qui voit le profil, les statistiques, la présence ; demandes
# d'ami par code seulement ; recherche ; classements).
#
import pytest
from fastapi import Depends
from sqlalchemy import select

from app.auth.dependencies import get_current_user, get_current_user_optional
from app.db import database as db
from app.db.database import get_db
from app.db.models import GameHistory, User
from app.friends import router as friends_router
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.leaderboard import router as lb_router
from app.multiplayer import router as mp_router
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
        for model in (User, GameHistory, Friendship, FriendGroup, FriendGroupMember, UserBlock, GameInvitation):
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
            for name in ("Alice", "Bruno", "Carl"):
                u = User(firebase_uid=f"uid-{name.lower()}", email=f"{name.lower()}@test.dev", display_name=name,
                         games_played=3, games_won=2, best_score=300, bio=f"Je suis {name}", country="Canada",
                         friend_code=f"{name.upper()[:4]}-1234")
                session.add(u)
                out[name.lower()] = u
    return out


@pytest.fixture
def login(app):
    """La session de la requête relit l'utilisateur : comme en production (objet rattaché)."""
    def _login(user):
        user_id = user.id

        async def current(session=Depends(get_db)):          # même session que la route
            return await session.get(User, user_id)
        app.dependency_overrides[get_current_user] = current
        app.dependency_overrides[get_current_user_optional] = current
    yield _login
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


@pytest.fixture
def anonymous(app):
    def _anon():
        app.dependency_overrides[get_current_user_optional] = lambda: None
    return _anon


@pytest.fixture
def live(monkeypatch):
    tree = {"friends": {}, "links": []}
    monkeypatch.setattr(notif_service, "_notify_write", lambda *a, **k: None)
    monkeypatch.setattr(friends_router, "_friends_write", lambda uid, friends: tree["friends"].__setitem__(uid, dict(friends or {})))
    monkeypatch.setattr(friends_router, "_friend_link_write", lambda a, b, linked: tree["links"].append((a, b, linked)))
    monkeypatch.setattr(friends_router, "_friend_link_write_one_way",
                        lambda uids, a, b, hidden: tree["links"].append(("one-way", sorted(set([a, b]) - hidden))))
    for name in ("_sync_rtdb", "_delete_rtdb", "_lobby_write"):
        monkeypatch.setattr(mp_router, name, lambda *a, **k: None)
    return tree


async def _user(sessions, user_id):
    async with sessions() as s:
        return await s.get(User, user_id)


async def _befriend(client, login, a, b):
    login(a)
    r = await client.post(f"{API}/friends/requests", json={"user_id": b.id})
    assert r.status_code == 200, r.text
    login(b)
    assert (await client.post(f"{API}/friends/requests/{r.json()['request_id']}/accept")).status_code == 200


# ── Profil ────────────────────────────────────────────────────────

async def test_profile_completion_saves_every_field(client, login, users, sqlite_db):
    login(users["alice"])
    r = await client.patch(f"{API}/users/me", json={"display_name": "Alice B", "first_name": "Alice",
                                                     "last_name": "Martin"})
    assert r.status_code == 200, r.text
    assert (r.json()["last_name"], r.json()["display_name"], r.json()["profile_complete"]) == ("Martin", "Alice B", False)

    r = await client.patch(f"{API}/users/me", json={"age": 27, "country": "Canada"})
    body = r.json()
    assert (body["age"], body["country"], body["profile_complete"]) == (27, "Canada", True)
    saved = await _user(sqlite_db, users["alice"].id)
    assert (saved.first_name, saved.last_name, saved.age, saved.profile_complete) == ("Alice", "Martin", 27, True)

    # Un champ vidé efface la valeur : le profil redevient incomplet ; le pseudo, lui, ne s'efface pas
    r = await client.patch(f"{API}/users/me", json={"country": "", "display_name": None})
    assert (r.json()["country"], r.json()["profile_complete"], r.json()["display_name"]) == (None, False, "Alice B")


async def test_profile_validation(client, login, users):
    login(users["alice"])
    assert (await client.patch(f"{API}/users/me", json={"age": 3})).status_code == 422
    assert (await client.patch(f"{API}/users/me", json={"bio": "x" * 281})).status_code == 422
    assert (await client.patch(f"{API}/users/me", json={"avatar_url": "javascript:alert(1)"})).status_code == 422
    r = await client.patch(f"{API}/users/me", json={"first_name": "  Jean   Paul ", "age": 0})
    assert (r.json()["first_name"], r.json()["age"]) == ("Jean Paul", None)


# ── Confidentialité ───────────────────────────────────────────────

async def test_privacy_defaults_and_update(client, login, users):
    login(users["alice"])
    assert (await client.get(f"{API}/users/me/privacy")).json() == {
        "profile": "everyone", "stats": "everyone", "presence": "friends",
        "requests": "everyone", "search": True, "leaderboard": True}
    r = await client.put(f"{API}/users/me/privacy", json={"stats": "friends", "search": False})
    assert r.json()["stats"] == "friends" and r.json()["search"] is False and r.json()["profile"] == "everyone"
    assert (await client.put(f"{API}/users/me/privacy", json={"presence": "everyone"})).status_code == 422
    me = (await client.get(f"{API}/users/me")).json()
    assert me["privacy"]["stats"] == "friends"


async def test_public_profile_respects_audiences(client, login, anonymous, users, live):
    alice, bruno, carl = users["alice"], users["bruno"], users["carl"]
    await _befriend(client, login, alice, bruno)
    login(alice)
    await client.put(f"{API}/users/me/privacy", json={"profile": "friends", "stats": "nobody"})

    anonymous()
    p = (await client.get(f"{API}/users/{alice.id}/profile")).json()
    assert p["display_name"] == "Alice" and p["bio"] is None and p["friend_code"] is None
    assert p["games_played"] is None and sorted(p["hidden"]) == ["profile", "stats"]
    assert "email" not in p and "first_name" not in p

    login(bruno)                                                 # ami : voit le profil, pas les statistiques
    p = (await client.get(f"{API}/users/{alice.id}/profile")).json()
    assert p["bio"] == "Je suis Alice" and p["games_played"] is None and p["hidden"] == ["stats"]

    login(alice)                                                 # soi-même : tout
    p = (await client.get(f"{API}/users/{alice.id}/profile")).json()
    assert p["games_played"] == 3 and p["hidden"] == []

    login(carl)                                                  # recherche par code : profil masqué
    found = (await client.get(f"{API}/users/search", params={"q": "ALIC-1234"})).json()
    assert found[0]["country"] is None and found[0]["games_played"] is None

    login(bruno)                                                 # liste d'amis : profil visible, stats non
    friend = (await client.get(f"{API}/friends")).json()["friends"][0]
    assert friend["country"] == "Canada" and friend["games_played"] is None


async def test_search_and_requests_by_code_only(client, login, users, live):
    alice, bruno = users["alice"], users["bruno"]
    login(alice)
    await client.put(f"{API}/users/me/privacy", json={"search": False, "requests": "code"})

    login(bruno)
    assert (await client.get(f"{API}/users/search", params={"q": "Alic"})).json() == []       # par pseudo : invisible
    by_code = (await client.get(f"{API}/users/search", params={"q": "alic-1234"})).json()
    assert [u["display_name"] for u in by_code] == ["Alice"] and by_code[0]["accepts_requests"] is False

    r = await client.post(f"{API}/friends/requests", json={"user_id": alice.id})
    assert r.status_code == 403 and "code ami" in r.json()["detail"]
    r = await client.post(f"{API}/friends/requests", json={"friend_code": "ALIC-1234"})
    assert r.status_code == 200 and r.json()["status"] == "pending"

    # Alice, elle, peut toujours demander Bruno ; la demande réciproque vaut acceptation
    login(alice)
    r = await client.post(f"{API}/friends/requests", json={"user_id": bruno.id})
    assert r.json()["status"] == "accepted"


async def test_leaderboard_opt_out_and_private_avatar(client, login, users, sqlite_db):
    lb_router._cache.clear()
    async with sqlite_db() as s:
        async with s.begin():
            for u in (await s.execute(select(User))).scalars():
                u.avatar_url = f"https://img.test/{u.display_name}.png"
    login(users["alice"])
    await client.put(f"{API}/users/me/privacy", json={"leaderboard": False})
    login(users["bruno"])
    await client.put(f"{API}/users/me/privacy", json={"profile": "friends"})
    board = (await client.get(f"{API}/leaderboard")).json()
    names = {e["display_name"]: e for e in board["entries"]}
    assert "Alice" not in names and board["total_players"] == 2
    assert names["Bruno"]["avatar_url"] is None and names["Carl"]["avatar_url"].endswith("Carl.png")


async def test_hidden_presence_empties_the_friends_mirror(client, login, users, live):
    alice, bruno = users["alice"], users["bruno"]
    await _befriend(client, login, alice, bruno)
    login(alice)
    await client.put(f"{API}/users/me/privacy", json={"presence": "nobody"})
    assert live["friends"]["uid-alice"] == {}                    # personne ne lit sa présence
    await client.get(f"{API}/friends")
    assert live["friends"]["uid-alice"] == {}                    # la réparation ne la rouvre pas

    # Nouvel ami pendant que la présence est masquée : lien écrit chez Carl seulement
    await _befriend(client, login, users["carl"], alice)
    assert live["links"][-1] == ("one-way", [users["carl"].id])

    login(alice)
    await client.put(f"{API}/users/me/privacy", json={"presence": "friends"})
    assert live["friends"]["uid-alice"] == {"uid-bruno": True, "uid-carl": True}
