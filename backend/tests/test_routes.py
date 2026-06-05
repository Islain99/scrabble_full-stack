# tests/test_routes.py
#
# Tests d'intégration sur les routes critiques du backend.
#
# Lancer :
#   pytest tests/test_routes.py -v
#
# Prérequis :
#   pip install pytest pytest-asyncio httpx
#   Les variables d'env DATABASE_URL et FIREBASE_* ne sont PAS requises :
#   l'app démarre en mode dégradé (DB et Firebase désactivés).
#
import pytest
from httpx import AsyncClient, ASGITransport

# Import de l'application APRÈS avoir configuré le logging
from app.main import app


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


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
    """Moins de 2 joueurs → 422 ou 400."""
    r = await client.post("/game/start", params={"player_names": ["Solo"]})
    assert r.status_code in (400, 422)


@pytest.mark.anyio
async def test_start_game_invalid_difficulty(client):
    r = await client.post(
        "/game/start",
        params={"player_names": ["Alice", "Bob"], "difficulty": "impossible"},
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_start_game_success(client):
    """Partie valide → GameState avec game_id et deux joueurs."""
    r = await client.post(
        "/game/start",
        params={"player_names": ["Alice", "HAL 9000 (IA)"], "difficulty": "easy"},
    )
    # 503 accepté si le dictionnaire n'est pas chargé dans l'env CI
    if r.status_code == 503:
        pytest.skip("Dictionnaire non disponible dans cet environnement.")
    assert r.status_code == 200
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
    if r.status_code == 503:
        pytest.skip("Dictionnaire non disponible.")
    assert r.status_code == 200
    body = r.json()
    assert "valid" in body
    assert body["word"] == "SCRABBLE"


# ── /api/v2/auth ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_register_no_token(client):
    """Sans Bearer token → 403."""
    r = await client.post("/api/v2/auth/register", json={"display_name": "Test"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_login_no_token(client):
    """Sans Bearer token → 403."""
    r = await client.post("/api/v2/auth/login")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_me_no_token(client):
    """Sans Bearer token → 403."""
    r = await client.get("/api/v2/auth/me")
    assert r.status_code == 403


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


@pytest.mark.anyio
async def test_leaderboard_invalid_period(client):
    r = await client.get("/api/v2/leaderboard", params={"period": "decade"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_leaderboard_invalid_sort(client):
    r = await client.get("/api/v2/leaderboard", params={"sort_by": "luck"})
    assert r.status_code == 422


# ── Rate limiting ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_rate_limit_login(client):
    """
    11 appels rapides sur /login depuis la même IP de test
    doivent déclencher un 429.
    """
    headers = {"Authorization": "Bearer fake-token-for-rate-limit-test"}
    status_codes = []
    for _ in range(11):
        r = await client.post("/api/v2/auth/login", headers=headers)
        status_codes.append(r.status_code)
    # Au moins une réponse doit être 429
    assert 429 in status_codes, (
        f"Rate limit non déclenché. Codes obtenus : {set(status_codes)}"
    )