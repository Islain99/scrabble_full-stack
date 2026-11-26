# tests/test_admin.py
#
# Dashboard administrateur (lot A1) : accès réservé, vue d'ensemble, liste et fiche
# des joueurs, modifications (désactivation, rôle, pseudo) et journal des actions.
#
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends

from app.admin.models import AdminAction
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.chat.models import Conversation, ConversationMember, Message, MessageReport
from app.db import database as db
from app.db.database import get_db
from app.db.models import GameHistory, User
from app.multiplayer.models import MultiplayerGame, RoomStatus

pytestmark = pytest.mark.anyio

API = "/api/v2"
NOW = datetime.now(timezone.utc)


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (User, GameHistory, MultiplayerGame, Conversation, ConversationMember, Message,
                      MessageReport, AdminAction):
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
            specs = (
                ("Admin", True, NOW - timedelta(days=100), NOW),
                ("Bruno", False, NOW - timedelta(days=2), NOW - timedelta(hours=2)),
                ("Carla", False, NOW - timedelta(days=40), NOW - timedelta(days=20)),
            )
            for name, admin, created, login in specs:
                u = User(firebase_uid=f"uid-{name.lower()}", email=f"{name.lower()}@test.dev", display_name=name,
                         is_admin=admin, created_at=created, last_login_at=login,
                         friend_code=f"{name.upper()[:4]}-1234", mp_games=3 if name == "Bruno" else 0,
                         mp_rating=1250 if name == "Bruno" else 1200, games_played=2)
                session.add(u)
                out[name.lower()] = u
            await session.flush()
            b = out["bruno"]
            session.add_all([
                GameHistory(game_id="s1", user_id=b.id, user_score=320, ai_score=280, ai_difficulty="hard",
                            won=True, created_at=NOW - timedelta(days=1)),
                GameHistory(game_id="s2", user_id=b.id, user_score=200, ai_score=300, ai_difficulty="easy",
                            won=False, created_at=NOW - timedelta(days=50)),
                GameHistory(game_id="m1", user_id=b.id, user_score=310, ai_score=250, ai_difficulty="multiplayer",
                            ai_name="Carla", won=True, rating_delta=16, created_at=NOW),
                MultiplayerGame(room_id="ROOM01", host_user_id=b.id, guest_user_id=out["carla"].id,
                                status=RoomStatus.FINISHED, finished_at=NOW),
                MultiplayerGame(room_id="ROOM02", host_user_id=b.id, status=RoomStatus.WAITING),
            ])
            conv = Conversation(kind="global", name="Universel", unique_key="global")
            session.add(conv)
            await session.flush()
            msg = Message(conversation_id=conv.id, author_id=b.id, body="salut", created_at=NOW)
            session.add(msg)
            await session.flush()
            session.add(MessageReport(message_id=msg.id, reporter_id=out["carla"].id, reason="spam"))
    return out


@pytest.fixture
def login(app):
    def _login(user):
        user_id = user.id

        async def current(session=Depends(get_db)):
            return await session.get(User, user_id)
        app.dependency_overrides[get_current_user] = current
        app.dependency_overrides[get_current_user_optional] = current
    yield _login
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


async def _get(sessions, model, pk):
    async with sessions() as s:
        return await s.get(model, pk)


# ── Accès ─────────────────────────────────────────────────────────

async def test_admin_routes_are_reserved_to_admins(client, login, users):
    login(users["bruno"])
    for path in ("/admin/overview", "/admin/users", f"/admin/users/{users['carla'].id}", "/admin/actions"):
        assert (await client.get(f"{API}{path}")).status_code == 403, path
    r = await client.patch(f"{API}/admin/users/{users['carla'].id}", json={"is_active": False})
    assert r.status_code == 403


async def test_admin_routes_require_login(client):
    assert (await client.get(f"{API}/admin/overview")).status_code in (401, 403)


# ── Vue d'ensemble ────────────────────────────────────────────────

async def test_overview_counts_and_series(client, login, users):
    login(users["admin"])
    r = await client.get(f"{API}/admin/overview", params={"days": 30})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["users"]["total"] == 3
    assert body["users"]["new_period"] == 1                 # Bruno (Carla : 40 jours)
    assert body["users"]["active_24h"] == 2                 # Admin, Bruno
    assert body["users"]["admins"] == 1
    assert body["games"]["solo_total"] == 2                 # la partie multijoueur n'est pas du solo
    assert body["games"]["solo_period"] == 1
    assert body["games"]["solo_win_rate"] == 50.0
    assert body["games"]["mp_total"] == 1 and body["games"]["mp_waiting"] == 1
    assert body["chat"] == {"messages_period": 1, "reports_pending": 1, "muted_now": 0}
    assert body["solo_by_difficulty"] == {"hard": 1}
    assert len(body["series"]) == 30
    today = body["series"][-1]
    assert today["date"] == NOW.date().isoformat()
    assert (today["multiplayer"], today["messages"]) == (1, 1)
    assert sum(p["signups"] for p in body["series"]) == 1
    assert [p["display_name"] for p in body["top_players"]] == ["Bruno"]


async def test_overview_rejects_unknown_window(client, login, users):
    login(users["admin"])
    assert (await client.get(f"{API}/admin/overview", params={"days": 12})).status_code == 422


# ── Joueurs ───────────────────────────────────────────────────────

async def test_list_users_search_filter_sort_and_pages(client, login, users):
    login(users["admin"])
    r = await client.get(f"{API}/admin/users")
    body = r.json()
    assert body["total"] == 3
    assert [u["display_name"] for u in body["items"]] == ["Bruno", "Carla", "Admin"]   # plus récents d'abord

    r = await client.get(f"{API}/admin/users", params={"q": "CARL"})
    assert [u["display_name"] for u in r.json()["items"]] == ["Carla"]
    r = await client.get(f"{API}/admin/users", params={"q": "bruno@test"})
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/admin/users", params={"status": "admin"})
    assert [u["display_name"] for u in r.json()["items"]] == ["Admin"]
    r = await client.get(f"{API}/admin/users", params={"sort": "name", "page_size": 5, "page": 1})
    assert [u["display_name"] for u in r.json()["items"]] == ["Admin", "Bruno", "Carla"]
    r = await client.get(f"{API}/admin/users", params={"sort": "name", "page_size": 5, "page": 2})
    assert r.json()["items"] == [] and r.json()["total"] == 3


async def test_user_detail(client, login, users):
    login(users["admin"])
    r = await client.get(f"{API}/admin/users/{users['bruno'].id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "bruno@test.dev"
    assert (body["messages_count"], body["reports_against"], body["reports_pending"]) == (1, 1, 1)
    modes = [(g["mode"], g["game_id"]) for g in body["recent_games"]]
    assert modes == [("multiplayer", "m1"), ("solo", "s1"), ("solo", "s2")]
    assert body["recent_games"][0]["rating_delta"] == 16
    assert body["privacy"]["profile"] == "everyone"
    assert (await client.get(f"{API}/admin/users/9999")).status_code == 404


# ── Modifications ─────────────────────────────────────────────────

async def test_disable_enable_and_journal(client, login, users, sqlite_db):
    login(users["admin"])
    uid = users["bruno"].id
    r = await client.patch(f"{API}/admin/users/{uid}", json={"is_active": False, "reason": "triche"})
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False
    assert r.json()["actions"][0]["action"] == "user.disable"
    assert r.json()["actions"][0]["details"] == {"reason": "triche"}
    assert (await _get(sqlite_db, User, uid)).is_active is False

    r = await client.patch(f"{API}/admin/users/{uid}", json={"is_active": True})
    assert r.json()["is_active"] is True

    # Même valeur : aucune ligne de journal en plus
    await client.patch(f"{API}/admin/users/{uid}", json={"is_active": True})
    actions = (await client.get(f"{API}/admin/actions")).json()
    assert [a["action"] for a in actions] == ["user.enable", "user.disable"]
    assert actions[0]["admin_name"] == "Admin" and actions[0]["target_name"] == "Bruno"


async def test_promote_demote_and_guards(client, login, users):
    login(users["admin"])
    me, bruno = users["admin"].id, users["bruno"].id
    assert (await client.patch(f"{API}/admin/users/{me}", json={"is_active": False})).status_code == 400
    assert (await client.patch(f"{API}/admin/users/{me}", json={"is_admin": False})).status_code == 400

    r = await client.patch(f"{API}/admin/users/{bruno}", json={"is_admin": True})
    assert r.json()["is_admin"] is True
    # Bruno, administrateur, retire le rôle à Admin : il en reste un (lui)
    login(users["bruno"])
    r = await client.patch(f"{API}/admin/users/{me}", json={"is_admin": False})
    assert r.status_code == 200 and r.json()["is_admin"] is False
    # … mais ne peut pas retirer le sien (dernier administrateur, et c'est lui)
    assert (await client.patch(f"{API}/admin/users/{bruno}", json={"is_admin": False})).status_code == 400


async def test_rename_user(client, login, users):
    login(users["admin"])
    uid = users["carla"].id
    r = await client.patch(f"{API}/admin/users/{uid}", json={"display_name": "  Carla2  "})
    assert r.json()["display_name"] == "Carla2"
    assert r.json()["actions"][0]["details"] == {"from": "Carla", "to": "Carla2"}
    assert (await client.patch(f"{API}/admin/users/{uid}", json={"display_name": "x"})).status_code == 422


async def test_actions_pagination(client, login, users):
    login(users["admin"])
    uid = users["carla"].id
    for name in ("Un", "Deux", "Trois"):
        await client.patch(f"{API}/admin/users/{uid}", json={"display_name": name})
    first = (await client.get(f"{API}/admin/actions", params={"limit": 2})).json()
    assert [a["details"]["to"] for a in first] == ["Trois", "Deux"]
    rest = (await client.get(f"{API}/admin/actions", params={"limit": 2, "before_id": first[-1]["id"]})).json()
    assert [a["details"]["to"] for a in rest] == ["Un"]


# ── Premier administrateur (ADMIN_EMAILS) ─────────────────────────

async def test_admin_emails_promotes_on_login(monkeypatch):
    from app.auth import router as auth_router
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ADMIN_EMAILS", " Boss@Test.dev ,autre@test.dev")
    u = User(firebase_uid="x", email="boss@test.dev", display_name="Boss", is_admin=False)
    auth_router._promote_if_listed(u)
    assert u.is_admin is True
    v = User(firebase_uid="y", email="nobody@test.dev", display_name="N", is_admin=False)
    auth_router._promote_if_listed(v)
    assert v.is_admin is False


async def test_chat_moderation_is_journaled(client, login, users):
    login(users["admin"])
    uid = users["bruno"].id
    assert (await client.post(f"{API}/chat/admin/users/{uid}/mute", json={"minutes": 60})).status_code == 204
    r = await client.get(f"{API}/admin/users", params={"status": "muted"})
    assert [u["display_name"] for u in r.json()["items"]] == ["Bruno"]
    actions = (await client.get(f"{API}/admin/actions")).json()
    assert (actions[0]["action"], actions[0]["target_name"], actions[0]["details"]) == ("user.mute", "Bruno", {"minutes": 60})
