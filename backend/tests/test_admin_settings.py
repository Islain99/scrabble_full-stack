# tests/test_admin_settings.py
#
# Dashboard admin, lot A2 : politique des paramètres (défauts, verrouillés, masqués,
# options proposées), son application côté serveur (préférences, confidentialité,
# nouveaux comptes) et politique de confidentialité modifiable.
#
import pytest
from fastapi import Depends
from sqlalchemy import select

from app.admin.models import AdminAction
from app.appconfig.models import AppConfig
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.db import database as db
from app.db.database import get_db
from app.db.models import User

pytestmark = pytest.mark.anyio

API = "/api/v2"


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (User, AdminAction, AppConfig):
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
            out["admin"] = User(firebase_uid="uid-admin", email="admin@test.dev", display_name="Admin", is_admin=True)
            # Bruno a déjà choisi sa difficulté et sa palette ; Carla n'a rien choisi
            out["bruno"] = User(firebase_uid="uid-bruno", email="bruno@test.dev", display_name="Bruno",
                                game_preferences={"difficulty": "easy", "colorPalette": "ocean"})
            out["carla"] = User(firebase_uid="uid-carla", email="carla@test.dev", display_name="Carla")
            session.add_all(out.values())
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


async def _policy(client):
    return (await client.get(f"{API}/admin/settings")).json()["policy"]


async def _put(client, changes: dict, **extra):
    policy = await _policy(client)
    for key, value in changes.items():
        policy[key] = {**policy[key], **value}
    return await client.put(f"{API}/admin/settings", json={"settings": policy, **extra})


# ── Catalogue et validation ───────────────────────────────────────

async def test_settings_reserved_to_admins(client, login, users):
    login(users["bruno"])
    assert (await client.get(f"{API}/admin/settings")).status_code == 403
    assert (await client.put(f"{API}/admin/settings", json={"settings": {}})).status_code == 403
    assert (await client.put(f"{API}/admin/privacy-policy", json={})).status_code == 403


async def test_builtin_policy_and_catalog(client, login, users):
    login(users["admin"])
    body = (await client.get(f"{API}/admin/settings")).json()
    assert body["custom"] is False
    keys = [c["key"] for c in body["catalog"]]
    assert keys[0] == "themeMode" and "privacy.leaderboard" in keys
    assert body["policy"]["difficulty"] == {"mode": "free", "default": "medium",
                                            "options": ["beginner", "easy", "medium", "hard_minus", "hard"]}
    assert body["policy"]["colorPalette"]["default"] is None          # pas de défaut imposé d'origine
    # Public, sans connexion
    pub = (await client.get(f"{API}/config")).json()
    assert pub["settings"]["showBonusLabels"] == {"mode": "free", "default": True, "options": None}


@pytest.mark.parametrize("changes, message", [
    ({"difficulty": {"default": "hard", "options": ["easy", "medium"]}}, "doit faire partie"),
    ({"turnDuration": {"options": []}}, "au moins une option"),
    ({"privacy.presence": {"mode": "locked"}}, "ne peut être que libre"),
    ({"showBonusLabels": {"default": "oui"}}, "oui ou non"),
    ({"colorPalette": {"mode": "locked"}}, "doit faire partie"),          # verrouillé sans défaut
])
async def test_invalid_policies_are_refused(client, login, users, changes, message):
    login(users["admin"])
    r = await _put(client, changes)
    assert r.status_code == 422 and message in r.text, r.text


async def test_unknown_setting_is_refused(client, login, users):
    login(users["admin"])
    r = await client.put(f"{API}/admin/settings", json={"settings": {"nope": {"mode": "free", "default": 1}}})
    assert r.status_code == 422


async def test_options_keep_catalog_order(client, login, users):
    login(users["admin"])
    r = await _put(client, {"turnDuration": {"default": 60, "options": [300, 60, 60]}})
    assert r.json()["policy"]["turnDuration"]["options"] == [60, 300]


# ── Préférences des joueurs ───────────────────────────────────────

async def test_defaults_locks_and_options_apply_to_preferences(client, login, users):
    login(users["admin"])
    r = await _put(client, {
        "showBonusLabels": {"mode": "locked", "default": False},
        "autoSortRack":    {"default": True},                                  # nouveau défaut, libre
        "difficulty":      {"default": "medium", "options": ["medium", "hard_minus", "hard"]},
        "colorPalette":    {"default": "foret"},
    }, note="essai")
    assert r.status_code == 200, r.text
    assert r.json()["custom"] is True and r.json()["updated_by_name"] == "Admin"

    login(users["carla"])                       # rien choisi : défauts de l'admin
    prefs = (await client.get(f"{API}/users/me/preferences")).json()
    assert (prefs["showBonusLabels"], prefs["autoSortRack"], prefs["colorPalette"]) == (False, True, "foret")

    login(users["bruno"])                       # « easy » n'est plus proposé → défaut ; palette choisie gardée
    prefs = (await client.get(f"{API}/users/me/preferences")).json()
    assert (prefs["difficulty"], prefs["colorPalette"]) == ("medium", "ocean")

    # Modifications : verrouillé et option retirée ignorés, le reste enregistré
    r = await client.put(f"{API}/users/me/preferences",
                         json={"showBonusLabels": True, "difficulty": "easy", "autoSortRack": False})
    assert r.status_code == 200
    assert (r.json()["showBonusLabels"], r.json()["difficulty"], r.json()["autoSortRack"]) == (False, "medium", False)
    r = await client.put(f"{API}/users/me/preferences", json={"difficulty": "hard"})
    assert r.json()["difficulty"] == "hard"

    # Journal
    login(users["admin"])
    action = (await client.get(f"{API}/admin/actions")).json()[0]
    assert action["action"] == "config.settings"
    assert set(action["details"]["changed"]) == {"showBonusLabels", "autoSortRack", "difficulty", "colorPalette"}
    assert action["details"]["reason"] == "essai"


async def test_only_chosen_preferences_are_stored(client, login, users, sqlite_db):
    login(users["carla"])
    await client.put(f"{API}/users/me/preferences", json={"turnDuration": 60})
    async with sqlite_db() as s:
        stored = (await s.get(User, users["carla"].id)).game_preferences
    assert stored == {"turnDuration": 60}

    # Un défaut changé ensuite s'applique aux clés jamais choisies
    login(users["admin"])
    await _put(client, {"animationsEnabled": {"default": False}})
    login(users["carla"])
    prefs = (await client.get(f"{API}/users/me/preferences")).json()
    assert (prefs["turnDuration"], prefs["animationsEnabled"]) == (60, False)


async def test_reset_returns_to_builtin(client, login, users):
    login(users["admin"])
    await _put(client, {"showBonusLabels": {"mode": "hidden", "default": False}})
    r = await client.delete(f"{API}/admin/settings")
    assert r.json()["custom"] is False and r.json()["policy"]["showBonusLabels"]["mode"] == "free"
    login(users["carla"])
    assert (await client.get(f"{API}/users/me/preferences")).json()["showBonusLabels"] is True


# ── Confidentialité ───────────────────────────────────────────────

async def test_privacy_lock_rewrites_accounts_and_blocks_changes(client, login, users, sqlite_db):
    login(users["admin"])
    r = await _put(client, {
        "privacy.leaderboard": {"mode": "locked", "default": False},
        "privacy.stats":       {"default": "friends", "options": ["friends", "nobody"]},
    })
    assert r.json()["privacy_updates"] == {"privacy.leaderboard": 3, "privacy.stats": 3}
    async with sqlite_db() as s:
        rows = (await s.execute(select(User.privacy_leaderboard, User.privacy_stats))).all()
    assert set(rows) == {(False, "friends")}

    login(users["bruno"])
    r = await client.put(f"{API}/users/me/privacy", json={"leaderboard": True})
    assert r.status_code == 403
    assert (await client.put(f"{API}/users/me/privacy", json={"stats": "everyone"})).status_code == 403
    r = await client.put(f"{API}/users/me/privacy", json={"stats": "nobody"})
    assert r.status_code == 200 and r.json()["stats"] == "nobody"


async def test_new_accounts_get_privacy_defaults(client, login, users, sqlite_db):
    from app.auth.router import _apply_privacy_defaults
    login(users["admin"])
    await _put(client, {"privacy.profile": {"default": "friends"}, "privacy.search": {"default": False}})
    async with sqlite_db() as s:
        u = User(firebase_uid="new", email="new@test.dev", display_name="Nouveau")
        await _apply_privacy_defaults(s, u)
    assert (u.privacy_profile, u.privacy_search, u.privacy_presence) == ("friends", False, "friends")


async def test_public_config_reflects_policy(client, login, users):
    login(users["admin"])
    await _put(client, {"language": {"mode": "locked", "default": "en"}})
    pub = (await client.get(f"{API}/config")).json()
    assert pub["settings"]["language"] == {"mode": "locked", "default": "en", "options": ["fr", "en"]}
    assert pub["updated_at"]


# ── Politique de confidentialité ──────────────────────────────────

POLICY = {
    "updated_on": "2026-11-26",
    "fr": {"title": "Politique", "intro": "Bonjour", "contactLabel": "Contact", "contactFallback": "Messagerie",
           "sections": [{"title": "Données", "items": ["E-mail", "  ", "Pseudo"], "paragraphs": []},
                        {"title": "Messagerie", "warning": True, "paragraphs": ["Pas chiffrée."]}]},
    "en": {"title": "Policy", "intro": "Hello", "contactLabel": "Contact", "contactFallback": "Messaging",
           "sections": [{"title": "Data", "items": ["Email"]}]},
    "note": "ajout de la section admin",
}


async def test_privacy_policy_publish_read_reset(client, login, users):
    assert (await client.get(f"{API}/config/privacy-policy")).json() == {"custom": False, "document": None, "updated_at": None}
    login(users["admin"])
    r = await client.put(f"{API}/admin/privacy-policy", json=POLICY)
    assert r.status_code == 200, r.text
    assert r.json()["document"]["fr"]["sections"][0]["items"] == ["E-mail", "Pseudo"]      # lignes vides retirées
    assert "note" not in r.json()["document"]

    pub = (await client.get(f"{API}/config/privacy-policy")).json()
    assert pub["custom"] is True and pub["document"]["updated_on"] == "2026-11-26"
    assert pub["document"]["en"]["title"] == "Policy"

    action = (await client.get(f"{API}/admin/actions")).json()[0]
    assert (action["action"], action["details"]["reason"]) == ("config.privacy_policy", "ajout de la section admin")

    r = await client.delete(f"{API}/admin/privacy-policy")
    assert r.json()["custom"] is False
    assert (await client.get(f"{API}/config/privacy-policy")).json()["custom"] is False


async def test_privacy_policy_validation(client, login, users):
    login(users["admin"])
    bad = {**POLICY, "en": {**POLICY["en"], "sections": []}}
    assert (await client.put(f"{API}/admin/privacy-policy", json=bad)).status_code == 422
    bad = {**POLICY, "fr": {**POLICY["fr"], "sections": [{"title": "   ", "items": ["x"]}]}}
    assert (await client.put(f"{API}/admin/privacy-policy", json=bad)).status_code == 422


async def test_public_config_without_database(client):
    # Pas de base (CI) : valeurs d'origine, le jeu reste jouable
    r = await client.get(f"{API}/config")
    assert r.status_code == 200 and r.json()["settings"]["difficulty"]["default"] == "medium"
    assert r.headers["cache-control"] == "public, max-age=60"
