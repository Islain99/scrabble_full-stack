# tests/test_routes.py
#
# Tests d'intégration sur les routes critiques du backend.
#
# Lancer :
#   cd backend && pytest tests/test_routes.py -v
#
# Les fixtures `client` / `app` sont définies dans tests/conftest.py :
# l'app tourne sans PostgreSQL ni Firebase (mode dégradé), mais avec le
# vrai dictionnaire chargé par le lifespan.
#
import pytest


# ── Routes système ────────────────────────────────────────────────

@pytest.mark.anyio
async def test_root(client):
    r = await client.get("/")
    assert r.status_code == 200
    assert "Scrabble" in r.json()["message"]


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "db" in body
    assert "dictionary" in body


# ── /game ─────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_difficulties(client):
    r = await client.get("/game/difficulties")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "easy" in data or "medium" in data  # au moins un niveau présent


@pytest.mark.anyio
async def test_start_game_missing_players(client):
    """Moins de 2 joueurs → 400. (Le frontend envoie la liste en corps JSON.)"""
    r = await client.post("/game/start", json=["Solo"])
    assert r.status_code == 400


@pytest.mark.anyio
async def test_start_game_invalid_difficulty(client):
    r = await client.post(
        "/game/start",
        params={"difficulty": "impossible"},
        json=["Alice", "Bob"],
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_start_game_success(client):
    """Partie valide → GameState avec game_id et deux joueurs."""
    r = await client.post(
        "/game/start",
        params={"difficulty": "easy"},
        json=["Alice", "HAL 9000 (IA)"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "game_id" in body
    assert len(body["players"]) == 2


@pytest.mark.anyio
async def test_get_status_not_found(client):
    r = await client.get("/game/status/partie-inexistante-xyz")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_validate_word(client):
    """L'endpoint de validation doit répondre même sans dictionnaire."""
    r = await client.get("/game/validate", params={"word": "SCRABBLE"})
    assert r.status_code == 200
    body = r.json()
    assert "valid" in body
    assert body["word"] == "SCRABBLE"


# ── /api/v2/auth ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_register_no_token(client):
    """Sans Bearer token → 401 (FastAPI ≥ 0.12x : HTTPBearer renvoie 401)."""
    r = await client.post("/api/v2/auth/register", json={"display_name": "Test"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_login_no_token(client):
    """Sans Bearer token → 401 (FastAPI ≥ 0.12x : HTTPBearer renvoie 401)."""
    r = await client.post("/api/v2/auth/login")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_me_no_token(client):
    """Sans Bearer token → 401 (FastAPI ≥ 0.12x : HTTPBearer renvoie 401)."""
    r = await client.get("/api/v2/auth/me")
    assert r.status_code == 401


# ── /api/v2/leaderboard ──────────────────────────────────────────

@pytest.mark.anyio
async def test_leaderboard_default(client):
    """Sans DB → 503. Avec DB → 200 + structure attendue."""
    r = await client.get("/api/v2/leaderboard")
    if r.status_code == 503:
        pytest.skip("DB non disponible dans cet environnement.")
    assert r.status_code == 200
    body = r.json()
    assert "entries" in body
    assert "total_players" in body
    assert body["period"] == "all"
    assert body["sort_by"] == "best_score"


@pytest.fixture
def fake_db(app):
    """
    Remplace get_db par une session factice : sans cela, l'absence de DB
    (503) masque la validation des paramètres (422).
    """
    from app.db.database import get_db

    async def _fake_db():
        yield None

    app.dependency_overrides[get_db] = _fake_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.anyio
async def test_leaderboard_invalid_period(client, fake_db):
    r = await client.get("/api/v2/leaderboard", params={"period": "decade"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_leaderboard_invalid_sort(client, fake_db):
    r = await client.get("/api/v2/leaderboard", params={"sort_by": "luck"})
    assert r.status_code == 422


# ── Rate limiting ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_rate_limit_login(client):
    """
    11 appels rapides sur /login depuis la même IP de test
    doivent déclencher un 429.
    """
    headers = {
        "Authorization": "Bearer fake-token-for-rate-limit-test",
        # IP dédiée : les autres tests /login ne consomment pas ce quota
        "X-Forwarded-For": "203.0.113.42",
    }
    status_codes = []
    for _ in range(11):
        r = await client.post("/api/v2/auth/login", headers=headers)
        status_codes.append(r.status_code)
    # Les 10 premiers passent le limiteur (puis échouent plus loin : pas de
    # DB/Firebase), le 11e doit être bloqué AVANT tout accès DB.
    assert 429 not in status_codes[:10], status_codes
    assert status_codes[10] == 429, (
        f"Rate limit non déclenché. Codes obtenus : {set(status_codes)}"
    )