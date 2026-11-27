# tests/test_admin_a4.py
#
# Dashboard admin, lot A4 : règles de la messagerie (filtre, liens, lecture seule,
# cadence), badge d'abonnement dans les messages, champs du profil (exigés,
# non demandés, montrés), publications (public, diffusion, bandeau) et textes push.
#
from datetime import datetime, timedelta, timezone

import pytest

from app.admin.models import AdminAction
from app.announcements import service as ann_service
from app.announcements.models import Announcement
from app.appconfig.models import AppConfig
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.chat.models import Conversation, ConversationMember, Message, MessageReport
from app.db import database as db
from app.db.database import get_db
from fastapi import Depends
from app.db.models import GameHistory, User
from app.economy.models import CreditTransaction, SubscriptionTier, UserUnlock
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, UserBlock
from app.multiplayer.models import MultiplayerGame
from app.notifications.models import GameInvitation
from tests.test_chat import live  # noqa: F401 — base temps réel simulée

pytestmark = pytest.mark.anyio

API = "/api/v2"
NOW = datetime.now(timezone.utc)
OLD = NOW - timedelta(days=10)


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (SubscriptionTier, User, CreditTransaction, UserUnlock, GameHistory, MultiplayerGame,
                      Friendship, FriendGroup, FriendGroupMember, UserBlock, GameInvitation, Conversation,
                      ConversationMember, Message, MessageReport, AdminAction, AppConfig, Announcement):
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
            free = SubscriptionTier(slug="gratuit", name_fr="Gratuit", name_en="Free", is_default=True)
            premium = SubscriptionTier(slug="premium", name_fr="Premium", name_en="Premium", badge="★")
            session.add_all([free, premium])
            await session.flush()
            out["free_tier"], out["premium_tier"] = free.id, premium.id
            specs = {
                "admin": dict(is_admin=True),
                "alice": dict(tier_id=premium.id, first_name="Alice", last_name="A", age=30, country="Canada",
                              bio="Bonjour", profile_complete=True),
                "bruno": dict(first_name="Bruno", last_name="B", age=25, country="France", profile_complete=True),
                "carl": dict(created_at=NOW - timedelta(hours=1)),
            }
            for name, extra in specs.items():
                u = User(firebase_uid=f"uid-{name}", email=f"{name}@test.dev", display_name=name.capitalize(),
                         **{"created_at": OLD, **extra})
                session.add(u)
                out[name] = u
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


def logout(app):
    app.dependency_overrides[get_current_user_optional] = lambda: None


async def _global_id(client):
    convs = (await client.get(f"{API}/chat/conversations")).json()
    return next(c["id"] for c in convs if c["kind"] == "global")


async def _send(client, conv_id, body):
    return await client.post(f"{API}/chat/conversations/{conv_id}/messages", json={"body": body})


async def _chat_rules(client, **changes):
    rules = (await client.get(f"{API}/admin/chat")).json()["rules"]
    return await client.put(f"{API}/admin/chat", json={**rules, **changes})


# ── Messagerie ────────────────────────────────────────────────────

async def test_chat_rules_filter_links_length_and_read_only(client, login, users, live):
    login(users["admin"])
    r = await _chat_rules(client, extra_words=["Gros Nul", "zut"], min_interval_s=0, links="none",
                          max_length=40, rules_fr="Soyez courtois.", note="essai")
    assert r.status_code == 200, r.text
    assert r.json()["rules"]["extra_words"] == ["gros nul", "zut"] and "putain" in r.json()["builtin_words"]

    login(users["alice"])
    gid = await _global_id(client)
    settings = (await client.get(f"{API}/chat/settings")).json()
    assert (settings["rules_fr"], settings["max_length"], settings["global_enabled"]) == ("Soyez courtois.", 40, True)

    r = await _send(client, gid, "Zut, quel gros nul")
    assert r.status_code == 201 and r.json()["body"] == "***, quel ********"
    assert r.json()["author_tier_id"] == users["premium_tier"]                  # badge Premium
    assert (await _send(client, gid, "x" * 41)).status_code == 422
    assert "pas permis" in (await _send(client, gid, "va sur www.exemple.com")).json()["detail"]

    # Mode « refuser » : le message n'est pas publié
    login(users["admin"])
    await _chat_rules(client, filter_mode="block")
    login(users["bruno"])
    r = await _send(client, gid, "zut alors")
    assert r.status_code == 422 and "mot interdit" in r.json()["detail"]

    # Lecture seule : les joueurs ne publient plus, l'admin oui
    login(users["admin"])
    await _chat_rules(client, global_enabled=False)
    login(users["bruno"])
    assert (await _send(client, gid, "bonjour")).status_code == 403
    login(users["admin"])
    assert (await _send(client, gid, "Fermé. Voir www.exemple.com")).status_code == 201

    # Historique : badge de l'auteur, et journal des modifications
    login(users["alice"])
    history = (await client.get(f"{API}/chat/conversations/{gid}/messages")).json()["messages"]
    assert history[0]["author_tier_id"] == users["premium_tier"] and history[-1]["author_tier_id"] is None
    login(users["admin"])
    action = next(a for a in (await client.get(f"{API}/admin/actions")).json() if a["action"] == "config.chat")
    assert "global_enabled" in action["details"]["changed"]


async def test_chat_links_for_new_accounts_and_cadence(client, login, users, live):
    login(users["admin"])
    await _chat_rules(client, link_min_age_hours=2, min_interval_s=0, max_per_minute=2)
    login(users["carl"])                                                     # compte d'une heure
    gid = await _global_id(client)
    r = await _send(client, gid, "www.exemple.com")
    assert r.status_code == 422 and "2 h" in r.json()["detail"]
    assert (await _send(client, gid, "un")).status_code == 201
    assert (await _send(client, gid, "deux")).status_code == 201
    assert (await _send(client, gid, "trois")).status_code == 429


async def test_chat_admin_stats_and_validation(client, login, users, live):
    login(users["admin"])
    body = (await client.get(f"{API}/admin/chat")).json()
    assert body["custom"] is False and body["rules"]["max_length"] == 500 and body["slow_mode_s"] == 0
    assert (await _chat_rules(client, extra_words=["<script>"])).status_code == 422
    assert (await _chat_rules(client, max_length=5000)).status_code == 422
    r = await client.delete(f"{API}/admin/chat")
    assert r.json()["custom"] is False


# ── Champs du profil ──────────────────────────────────────────────

async def _profile_rules(client, fields=None, **extra):
    rules = (await client.get(f"{API}/admin/profile-fields")).json()["rules"]
    for name, rule in (fields or {}).items():
        rules["fields"][name] = {**rules["fields"][name], **rule}
    return await client.put(f"{API}/admin/profile-fields", json={**rules, **extra})


async def test_profile_fields_required_off_and_public(client, login, users, app):
    login(users["admin"])
    body = (await client.get(f"{API}/admin/profile-fields")).json()
    assert body["rules"]["fields"]["age"] == {"collect": "required", "public": False}
    assert body["stats"]["complete"] == 2 and body["stats"]["filled"]["bio"] == 1

    # La bio devient exigée et privée, l'âge n'est plus demandé
    r = await _profile_rules(client, {"bio": {"collect": "required", "public": False},
                                      "age": {"collect": "off"}}, min_age=13)
    assert r.status_code == 200, r.text
    assert r.json()["recomputed"] == {"became_complete": 0, "became_incomplete": 1}     # Bruno n'a pas de bio
    assert r.json()["stats"]["complete"] == 1

    # Public : les règles du formulaire
    pub = (await client.get(f"{API}/config/profile")).json()
    assert pub["fields"]["age"]["collect"] == "off" and pub["min_age"] == 13

    # Bruno complète : l'âge envoyé est ignoré, la bio le rend complet
    login(users["bruno"])
    r = await client.patch(f"{API}/users/me", json={"bio": "Salut", "age": 99})
    assert r.status_code == 200 and r.json()["profile_complete"] is True and r.json()["age"] == 25

    # La bio d'Alice n'est plus montrée aux autres (mais à elle, oui)
    profile = (await client.get(f"{API}/users/{users['alice'].id}/profile")).json()
    assert profile["bio"] is None and "bio" in profile["hidden"] and profile["country"] == "Canada"
    login(users["alice"])
    assert (await client.get(f"{API}/users/{users['alice'].id}/profile")).json()["bio"] == "Bonjour"

    # Âge minimal (l'âge redevient demandé)
    login(users["admin"])
    await _profile_rules(client, {"age": {"collect": "optional"}}, min_age=13)
    login(users["bruno"])
    r = await client.patch(f"{API}/users/me", json={"age": 10})
    assert r.status_code == 422 and "13" in r.json()["detail"]


async def test_profile_rules_validation_and_reset(client, login, users):
    login(users["admin"])
    assert (await _profile_rules(client, min_age=40)).status_code == 422
    # Prénom « public » : impossible (jamais montré aux autres)
    r = await _profile_rules(client, {"first_name": {"public": True}})
    assert r.json()["rules"]["fields"]["first_name"]["public"] is False
    r = await _profile_rules(client, {"country": {"collect": "optional"}})
    assert r.json()["recomputed"] == {"became_complete": 0, "became_incomplete": 0}   # personne ne change
    r = await client.delete(f"{API}/admin/profile-fields")
    assert r.json()["custom"] is False


# ── Publications ──────────────────────────────────────────────────

ANN = {"title_fr": "Tournoi samedi", "title_en": "Saturday tournament", "body_fr": "Inscrivez-vous !",
       "body_en": "Sign up!", "kind": "event", "link": "#/multiplayer"}


@pytest.fixture
def fanout(monkeypatch):
    sent = {"rtdb": [], "push": []}
    monkeypatch.setattr(ann_service, "_fanout_write", lambda uids, key, data: sent["rtdb"].append((sorted(uids), key, data)))
    monkeypatch.setattr(ann_service.push_service, "push",
                        lambda uids, category, kind, params=None, url="#/", tag=None, per_uid=None:
                        sent["push"].append((sorted(uids), category, kind, params, url, tag)))
    return sent


async def test_announcement_lifecycle_and_audience(client, login, users, app, fanout):
    login(users["admin"])
    assert (await client.post(f"{API}/admin/announcements", json={**ANN, "link": "javascript:alert(1)"})).status_code == 422
    assert (await client.post(f"{API}/admin/announcements", json={**ANN, "show_banner": False})).status_code == 422
    assert (await client.post(f"{API}/admin/announcements", json={**ANN, "audience_tiers": [999]})).status_code == 422

    # Pour les abonnés Premium seulement, avec notification
    r = await client.post(f"{API}/admin/announcements", json={**ANN, "audience_tiers": [users["premium_tier"]], "notify": True})
    assert r.status_code == 201, r.text
    ann = r.json()
    assert (ann["status"], ann["live"]) == ("draft", False)
    assert (await client.get(f"{API}/announcements")).json() == []                # brouillon : invisible

    r = await client.post(f"{API}/admin/announcements/{ann['id']}/publish")
    assert r.json()["status"] == "published" and r.json()["live"] is True and r.json()["notified_count"] == 1
    uids, key, data = fanout["rtdb"][0]
    assert (uids, key, data["type"], data["title_en"]) == (["uid-alice"], f"ann-{ann['id']}", "announcement", "Saturday tournament")
    assert fanout["push"][0][1:3] == ("news", "announcement") and fanout["push"][0][4] == "#/multiplayer"

    # Republier ne renotifie pas
    await client.post(f"{API}/admin/announcements/{ann['id']}/publish")
    assert len(fanout["rtdb"]) == 1

    login(users["alice"])
    assert [a["title_fr"] for a in (await client.get(f"{API}/announcements")).json()] == ["Tournoi samedi"]
    login(users["bruno"])
    assert (await client.get(f"{API}/announcements")).json() == []
    logout(app)
    assert (await client.get(f"{API}/announcements")).json() == []

    # Niveau par défaut ciblé : Bruno (sans abonnement) la voit
    login(users["admin"])
    r = await client.patch(f"{API}/admin/announcements/{ann['id']}",
                           json={**ANN, "audience_tiers": [users["free_tier"]], "notify": True})
    assert r.status_code == 200
    login(users["bruno"])
    assert len((await client.get(f"{API}/announcements")).json()) == 1

    # Retirée : plus de bandeau, fiche retirée des cloches
    login(users["admin"])
    r = await client.post(f"{API}/admin/announcements/{ann['id']}/archive")
    assert r.json()["status"] == "archived"
    assert fanout["rtdb"][-1][1:] == (f"ann-{ann['id']}", None)
    assert (await client.patch(f"{API}/admin/announcements/{ann['id']}", json=ANN)).status_code == 400
    login(users["bruno"])
    assert (await client.get(f"{API}/announcements")).json() == []


async def test_announcement_schedule_everyone_and_list(client, login, users, app, fanout):
    login(users["admin"])
    later = (NOW + timedelta(days=2)).isoformat()
    soon = (NOW + timedelta(days=1)).isoformat()
    assert (await client.post(f"{API}/admin/announcements", json={**ANN, "starts_at": later, "ends_at": soon})).status_code == 422

    scheduled = (await client.post(f"{API}/admin/announcements", json={**ANN, "starts_at": soon})).json()
    everyone = (await client.post(f"{API}/admin/announcements", json={**ANN, "title_fr": "Maintenance", "kind": "maintenance"})).json()
    for a in (scheduled, everyone):
        await client.post(f"{API}/admin/announcements/{a['id']}/publish")
    assert fanout["rtdb"] == []                                                  # aucune notification demandée

    logout(app)                                                                  # invité : « tout le monde » seulement
    assert [a["title_fr"] for a in (await client.get(f"{API}/announcements")).json()] == ["Maintenance"]

    login(users["admin"])
    page = (await client.get(f"{API}/admin/announcements")).json()
    assert [a["live"] for a in page["items"]] == [True, False] and page["devices"] == {}
    assert (await client.get(f"{API}/admin/announcements", params={"status": "draft"})).json()["items"] == []
    assert (await client.delete(f"{API}/admin/announcements/{scheduled['id']}")).status_code == 204
    actions = [a["action"] for a in (await client.get(f"{API}/admin/actions")).json()]
    assert actions[0] == "announcement.delete" and "announcement.publish" in actions


async def test_announcement_reserved_to_admins(client, login, users):
    login(users["bruno"])
    assert (await client.get(f"{API}/admin/announcements")).status_code == 403
    assert (await client.post(f"{API}/admin/announcements", json=ANN)).status_code == 403
    assert (await client.get(f"{API}/admin/chat")).status_code == 403
    assert (await client.get(f"{API}/admin/profile-fields")).status_code == 403


# ── Notifications push ────────────────────────────────────────────

def test_push_texts_follow_device_language():
    from app.push.messages import render
    params = {"title_fr": "Tournoi", "title_en": "Tournament", "body_fr": "Samedi", "body_en": "Saturday"}
    assert render("announcement", "en", params) == ("Tournament", "Saturday")
    assert render("announcement", "fr-CA", params) == ("Tournoi", "Samedi")


def test_news_push_is_a_player_setting():
    from app.appconfig.catalog import CATALOG
    from app.db.models import DEFAULT_PREFERENCES
    from app.push.service import CATEGORY_PREF
    assert CATEGORY_PREF["news"] == "pushNews" and DEFAULT_PREFERENCES["pushNews"] is True
    assert CATALOG["pushNews"][0] == "notifications"
