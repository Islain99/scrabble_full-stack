# tests/test_economy.py
#
# Dashboard admin, lot A3 : niveaux d'abonnement, crédits (gains, plafond, grand
# livre, ajustements admin), indices en solo et palettes premium.
#
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends

from app.admin.models import AdminAction
from app.appconfig.models import AppConfig
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.db import database as db
from app.db.database import get_db
from app.db.models import GameHistory, User
from app.economy import service as economy
from app.economy.models import CreditTransaction, SubscriptionTier, UserUnlock
from app.chat.models import Conversation, ConversationMember, Message, MessageReport
from app.friends.models import Friendship, UserBlock
from app.solo.models import SoloGame

pytestmark = pytest.mark.anyio

API = "/api/v2"
NOW = datetime.now(timezone.utc)


@pytest.fixture
async def sqlite_db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        for model in (SubscriptionTier, User, CreditTransaction, UserUnlock, GameHistory, SoloGame,
                      AdminAction, AppConfig, Conversation, ConversationMember, Message, MessageReport,
                      Friendship, UserBlock):
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
            session.add(SubscriptionTier(slug="gratuit", name_fr="Gratuit", name_en="Free", is_default=True))
            out["admin"] = User(firebase_uid="uid-admin", email="admin@test.dev", display_name="Admin", is_admin=True)
            out["bruno"] = User(firebase_uid="uid-bruno", email="bruno@test.dev", display_name="Bruno", credits=40)
            out["carla"] = User(firebase_uid="uid-carla", email="carla@test.dev", display_name="Carla",
                                game_preferences={"colorPalette": "ocean"})
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


async def _user(sessions, user_id):
    async with sessions() as s:
        return await s.get(User, user_id)


async def _ledger(sessions, user_id):
    from sqlalchemy import select
    async with sessions() as s:
        rows = (await s.execute(select(CreditTransaction).where(CreditTransaction.user_id == user_id)
                                .order_by(CreditTransaction.id))).scalars().all()
    return [(r.kind, r.amount, r.balance_after) for r in rows]


async def _rules(client, **changes):
    rules = (await client.get(f"{API}/admin/economy")).json()["rules"]
    return await client.put(f"{API}/admin/economy", json={**rules, **changes})


# ── Niveaux d'abonnement ──────────────────────────────────────────

async def test_tiers_crud_and_default(client, login, users):
    login(users["admin"])
    r = await client.get(f"{API}/admin/tiers")
    assert [(t["slug"], t["is_default"], t["users"]) for t in r.json()] == [("gratuit", True, 3)]

    r = await client.post(f"{API}/admin/tiers", json={
        "slug": "premium", "name_fr": "Premium", "name_en": "Premium", "color": "#C9A227", "badge": "★", "sort_order": 10})
    assert r.status_code == 201, r.text
    premium = next(t for t in r.json() if t["slug"] == "premium")
    assert premium["color"] == "#c9a227" and premium["is_default"] is False

    assert (await client.post(f"{API}/admin/tiers", json={"slug": "premium", "name_fr": "x", "name_en": "x"})).status_code == 409
    assert (await client.post(f"{API}/admin/tiers", json={"slug": "Pas Bon", "name_fr": "x", "name_en": "x"})).status_code == 422
    assert (await client.patch(f"{API}/admin/tiers/{premium['id']}", json={"color": "rouge"})).status_code == 422

    default_id = next(t["id"] for t in r.json() if t["slug"] == "gratuit")
    assert (await client.delete(f"{API}/admin/tiers/{default_id}")).status_code == 400
    assert (await client.patch(f"{API}/admin/tiers/{default_id}", json={"is_default": False})).status_code == 400

    # Public, sans connexion : de quoi dessiner les badges
    pub = (await client.get(f"{API}/economy/tiers")).json()
    assert [t["slug"] for t in pub] == ["gratuit", "premium"] and pub[1]["badge"] == "★"


async def test_assign_tier_with_expiry(client, login, users, sqlite_db):
    login(users["admin"])
    tiers = (await client.post(f"{API}/admin/tiers", json={"slug": "premium", "name_fr": "Premium", "name_en": "Premium"})).json()
    premium = next(t["id"] for t in tiers if t["slug"] == "premium")
    bruno = users["bruno"].id

    past = (NOW - timedelta(days=1)).isoformat()
    assert (await client.put(f"{API}/admin/users/{bruno}/tier", json={"tier_id": premium, "expires_at": past})).status_code == 422

    until = (NOW + timedelta(days=30)).isoformat()
    r = await client.put(f"{API}/admin/users/{bruno}/tier", json={"tier_id": premium, "expires_at": until, "reason": "concours"})
    assert r.status_code == 200, r.text
    assert r.json()["tier_id"] == premium and r.json()["tier_expires_at"]
    assert r.json()["actions"][0]["action"] == "user.tier"
    assert r.json()["actions"][0]["details"]["tier"] == "premium"

    counts = {t["slug"]: t["users"] for t in (await client.get(f"{API}/admin/tiers")).json()}
    assert counts == {"gratuit": 2, "premium": 1}
    r = await client.get(f"{API}/admin/users", params={"tier": str(premium)})
    assert [u["display_name"] for u in r.json()["items"]] == ["Bruno"]
    r = await client.get(f"{API}/admin/users", params={"tier": "default"})
    assert r.json()["total"] == 2

    # Profil public : le badge suit
    profile = (await client.get(f"{API}/users/{bruno}/profile")).json()
    assert profile["tier_id"] == premium and "credits" not in profile

    # Abonnement expiré → niveau par défaut
    async with sqlite_db() as s:
        async with s.begin():
            (await s.get(User, bruno)).tier_expires_at = NOW - timedelta(minutes=1)
    assert (await _user(sqlite_db, bruno)).effective_tier_id() is None
    r = await client.get(f"{API}/admin/users", params={"tier": "default"})
    assert r.json()["total"] == 3

    # Supprimer un niveau : ses abonnés reviennent au défaut
    await client.put(f"{API}/admin/users/{bruno}/tier", json={"tier_id": premium})
    await client.delete(f"{API}/admin/tiers/{premium}")
    assert (await _user(sqlite_db, bruno)).tier_id is None


# ── Crédits : ajustements et grand livre ──────────────────────────

async def test_admin_grant_and_debit(client, login, users, sqlite_db):
    login(users["admin"])
    bruno = users["bruno"].id
    r = await client.post(f"{API}/admin/users/{bruno}/credits", json={"amount": 60, "reason": "geste commercial"})
    assert r.status_code == 200 and r.json()["credits"] == 100
    r = await client.post(f"{API}/admin/users/{bruno}/credits", json={"amount": -150, "reason": "erreur"})
    assert r.status_code == 400 and "100" in r.json()["detail"]
    r = await client.post(f"{API}/admin/users/{bruno}/credits", json={"amount": -30, "reason": "abus"})
    assert r.json()["credits"] == 70
    assert (await client.post(f"{API}/admin/users/{bruno}/credits", json={"amount": 5, "reason": ""})).status_code == 422

    assert await _ledger(sqlite_db, bruno) == [("admin_grant", 60, 100), ("admin_debit", -30, 70)]
    txs = (await client.get(f"{API}/admin/users/{bruno}/transactions")).json()
    assert txs[0]["admin_name"] == "Admin" and txs[0]["note"] == "abus"
    all_txs = (await client.get(f"{API}/admin/transactions", params={"kind": "admin_grant"})).json()
    assert [t["user_name"] for t in all_txs] == ["Bruno"]
    action = (await client.get(f"{API}/admin/actions")).json()[0]
    assert (action["action"], action["details"]["amount"]) == ("user.credits", -30)


async def test_balance_never_negative_and_refs_are_unique(users, sqlite_db):
    async with sqlite_db() as s:
        async with s.begin():
            bruno = await s.get(User, users["bruno"].id)
            with pytest.raises(economy.InsufficientCredits):
                await economy.apply(s, bruno, -41, "hint")
            assert await economy.apply(s, bruno, 10, "mp_win", ref="mp:A:host") is not None
            assert await economy.apply(s, bruno, 10, "mp_win", ref="mp:A:host") is None     # déjà versé
    assert (await _user(sqlite_db, users["bruno"].id)).credits == 50


# ── Gains ─────────────────────────────────────────────────────────

async def test_daily_and_signup_bonus(users, sqlite_db):
    async with sqlite_db() as s:
        async with s.begin():
            carla = await s.get(User, users["carla"].id)
            await economy.earn_signup(s, carla)
            await economy.earn_signup(s, carla)               # une seule fois
            assert await economy.earn_daily(s, carla) is not None
            assert await economy.earn_daily(s, carla) is None  # une fois par jour
    assert await _ledger(sqlite_db, users["carla"].id) == [("signup", 50, 50), ("daily", 10, 60)]


def _solo_state(game_id, winner_human=True, finished=True):
    return {"game_id": game_id, "status": "FINISHED" if finished else "ACTIVE",
            "winner_id": 1 if winner_human else 2,
            "players": [{"id": 1, "name": "Moi", "is_ai": False}, {"id": 2, "name": "IA", "is_ai": True}]}


async def test_solo_win_is_checked_against_server_game(client, login, users, sqlite_db):
    async with sqlite_db() as s:
        async with s.begin():
            s.add_all([
                SoloGame(game_id="won-hard", difficulty="hard", status="FINISHED", state=_solo_state("won-hard")),
                SoloGame(game_id="lost", difficulty="hard", status="FINISHED", state=_solo_state("lost", winner_human=False)),
                SoloGame(game_id="running", difficulty="easy", status="ACTIVE", state=_solo_state("running", finished=False)),
            ])
    login(users["carla"])
    for gid in ("won-hard", "lost", "running", "unknown"):
        # Le client prétend avoir gagné à chaque fois : seul « won-hard » rapporte
        r = await client.post(f"{API}/users/me/games", json={
            "game_id": gid, "user_score": 300, "ai_name": "IA", "ai_score": 200, "ai_difficulty": "beginner", "won": True})
        assert r.status_code == 201, r.text
    assert await _ledger(sqlite_db, users["carla"].id) == [("solo_win", 20, 20)]     # difficulté du serveur : hard


async def test_daily_game_cap(client, login, users, sqlite_db):
    login(users["admin"])
    await _rules(client, daily_game_cap=25)
    async with sqlite_db() as s:
        async with s.begin():
            carla = await s.get(User, users["carla"].id)
            rules = await economy.get_rules(s)
            await economy.earn_for_game(s, carla, "mp_win", "mp:1:host", 20, rules)
            await economy.earn_for_game(s, carla, "mp_win", "mp:2:host", 20, rules)   # réduit à 5
            assert await economy.earn_for_game(s, carla, "mp_win", "mp:3:host", 20, rules) is None
    assert [a for _, a, _ in await _ledger(sqlite_db, users["carla"].id)] == [20, 5]


async def test_multiplayer_result_credits(users, sqlite_db):
    from app.multiplayer.router import _credit_mp_result
    async with sqlite_db() as s:
        async with s.begin():
            carla = await s.get(User, users["carla"].id)
            await _credit_mp_result(s, carla, "mp:ROOM:host", 0.5)
            await _credit_mp_result(s, carla, "mp:ROOM:host", 0.5)
            await _credit_mp_result(s, carla, "mp:OTHER:guest", 0.0)
    assert await _ledger(sqlite_db, users["carla"].id) == [("mp_draw", 10, 10), ("mp_loss", 5, 15)]


async def test_disabled_economy_pays_nothing(client, login, users, sqlite_db):
    login(users["admin"])
    await _rules(client, enabled=False)
    async with sqlite_db() as s:
        async with s.begin():
            carla = await s.get(User, users["carla"].id)
            await economy.earn_signup(s, carla)
            await economy.earn_daily(s, carla)
    assert await _ledger(sqlite_db, users["carla"].id) == []


# ── Règles (dashboard) ────────────────────────────────────────────

@pytest.mark.parametrize("changes, message", [
    ({"premium_palettes": {"neon": 50}}, "Palettes inconnues"),
    ({"premium_palettes": {"ocean": 0}}, "1 à 100 000"),
    ({"solo_win": {"impossible": 5}}, "Difficultés inconnues"),
    ({"hint_price": -1}, "greater than or equal"),
])
async def test_invalid_rules(client, login, users, changes, message):
    login(users["admin"])
    r = await _rules(client, **changes)
    assert r.status_code == 422 and message in r.text, r.text


async def test_rules_public_and_stats(client, login, users):
    login(users["admin"])
    r = await _rules(client, hint_price=25, premium_palettes={"ocean": 100, "foret": 80}, note="lancement")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["custom"] is True and body["kept_unlocks"] == 1          # Carla utilisait « ocean »
    assert body["rules"]["premium_palettes"] == {"ocean": 100, "foret": 80}
    assert body["stats"]["circulation"] == 40 and body["stats"]["palette_unlocks"] == {"ocean": 1}
    pub = (await client.get(f"{API}/economy/rules")).json()
    assert pub["hint_price"] == 25 and pub["premium_palettes"] == {"ocean": 100, "foret": 80}
    action = (await client.get(f"{API}/admin/actions")).json()[0]
    assert action["action"] == "config.economy" and action["details"]["kept_unlocks"] == 1


# ── Palettes premium ──────────────────────────────────────────────

async def test_premium_palettes(client, login, users):
    login(users["admin"])
    await _rules(client, premium_palettes={"ocean": 100, "foret": 30})

    login(users["carla"])                                  # garde « ocean », qu'elle utilisait déjà
    assert (await client.get(f"{API}/users/me/preferences")).json()["colorPalette"] == "ocean"
    assert (await client.get(f"{API}/economy/me")).json()["unlocked_palettes"] == ["ocean"]

    login(users["bruno"])                                  # 40 crédits
    r = await client.put(f"{API}/users/me/preferences", json={"colorPalette": "foret"})
    assert r.json()["colorPalette"] is None                # pas débloquée : refusée
    assert (await client.post(f"{API}/economy/me/unlocks", json={"item_key": "ocean"})).status_code == 402
    assert (await client.post(f"{API}/economy/me/unlocks", json={"item_key": "vintage"})).status_code == 400
    r = await client.post(f"{API}/economy/me/unlocks", json={"item_key": "foret"})
    assert r.status_code == 200 and r.json()["credits"] == 10 and r.json()["unlocked_palettes"] == ["foret"]
    r = await client.post(f"{API}/economy/me/unlocks", json={"item_key": "foret"})        # déjà à lui : gratuit
    assert r.json()["credits"] == 10
    r = await client.put(f"{API}/users/me/preferences", json={"colorPalette": "foret"})
    assert r.json()["colorPalette"] == "foret"
    assert r.status_code == 200
    tx = (await client.get(f"{API}/economy/me/transactions")).json()
    assert [(t["kind"], t["amount"], t["ref"]) for t in tx] == [("unlock", -30, "palette:foret")]


# ── Indices ───────────────────────────────────────────────────────

class StubEngine:
    def __init__(self, game):
        self.game, self.calls = game, 0

    def get_game(self, game_id):
        return self.game if game_id == self.game.game_id else None

    def suggest_move(self, game_id, player_id):
        self.calls += 1
        return {"placements": [[7, 7, "A"], [7, 8, "s"]], "word": "As", "score": 2}

    def get_difficulty(self, game_id):
        return "medium"


@pytest.fixture
def stub_engine(app):
    from api.models import Board, GameState, Player, Tile
    game = GameState(game_id="g-hint", board=Board(), remaining_tiles=[],
                     players=[Player(id=1, name="Moi", rack=[Tile(letter="A", score=1), Tile(letter="*", score=0)]),
                              Player(id=2, name="IA", is_ai=True)])
    previous = getattr(app.state, "game_engine", None)
    engine = StubEngine(game)
    app.state.game_engine = engine
    from api import index
    index._HINTS.clear()
    yield engine
    app.state.game_engine = previous


async def test_hint_charges_once_per_position_and_respects_limits(client, login, users, sqlite_db, stub_engine):
    login(users["admin"])
    await _rules(client, hint_price=15, hints_per_game=2)
    login(users["bruno"])                                                   # 40 crédits

    r = await client.post("/game/hint/g-hint", params={"player_id": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hint"]["word"] == "As" and (body["charged"], body["credits"], body["hints_left"]) == (15, 25, 1)

    # Même position : réaffiché sans payer, sans recalcul
    r = await client.post("/game/hint/g-hint", params={"player_id": 1})
    assert (r.json()["repeat"], r.json()["charged"], r.json()["credits"]) == (True, 0, 25)
    assert stub_engine.calls == 1

    from api import index
    index._HINTS.clear()                                                    # nouvelle position
    r = await client.post("/game/hint/g-hint", params={"player_id": 1})
    assert r.json()["credits"] == 10 and r.json()["hints_left"] == 0
    index._HINTS.clear()
    assert (await client.post("/game/hint/g-hint", params={"player_id": 1})).status_code == 429

    assert (await client.post("/game/hint/g-hint", params={"player_id": 2})).status_code == 400    # pas son tour
    assert [k for k, _, _ in await _ledger(sqlite_db, users["bruno"].id)] == ["hint", "hint"]


async def test_hint_needs_credits_and_enabled_economy(client, login, users, stub_engine):
    login(users["admin"])
    await _rules(client, hint_price=50)
    login(users["bruno"])
    r = await client.post("/game/hint/g-hint", params={"player_id": 1})
    assert r.status_code == 402 and stub_engine.calls == 0                  # rien calculé, rien payé

    login(users["admin"])
    await _rules(client, hint_price=0, enabled=False)
    login(users["bruno"])
    assert (await client.post("/game/hint/g-hint", params={"player_id": 1})).status_code == 403

    login(users["admin"])
    await _rules(client, hint_price=0, enabled=True)
    login(users["bruno"])
    r = await client.post("/game/hint/g-hint", params={"player_id": 1})
    assert (r.status_code, r.json()["charged"], r.json()["credits"]) == (200, 0, 40)   # gratuit, mais compté


async def test_engine_suggest_move_does_not_play(app):
    """Vrai moteur : l'indice ne change ni le plateau ni le chevalet."""
    engine = getattr(app.state, "game_engine", None)
    if engine is None:
        pytest.skip("Dictionnaire indisponible")
    game = engine.start_new_game(["Moi", "IA"], difficulty="medium", language="fr")
    me = game.players[0]
    rack_before = [t.letter for t in me.rack]
    hint = engine.suggest_move(game.game_id, me.id)
    assert all(cell is None for row in game.board.grid for cell in row)
    assert [t.letter for t in me.rack] == rack_before
    if hint:
        assert hint["score"] > 0 and len(hint["placements"]) >= 2
        assert any(r == 7 and c == 7 for r, c, _ in hint["placements"])     # premier coup : case centrale
    engine.forget_game(game.game_id)
