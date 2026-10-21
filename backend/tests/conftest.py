# tests/conftest.py
#
# Configuration commune des tests backend.
#
# Lancer depuis n'importe où :
#   cd backend && pytest
#   pytest backend/tests          (depuis la racine du dépôt)
#
# Aucune base PostgreSQL ni aucun compte Firebase n'est requis :
#   - DATABASE_URL est forcé à vide  → l'app démarre sans DB (routes DB = 503)
#   - Firebase échoue silencieusement → les routes protégées refusent l'accès
#   - le dictionnaire réel (api/dictionnaire.txt) est chargé par le lifespan
#
import os
import sys
from pathlib import Path

import pytest

# ── Environnement de test (AVANT tout import applicatif) ──────────
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = ""          # écrase un éventuel backend/.env local
os.environ.pop("FIREBASE_SERVICE_ACCOUNT_JSON", None)
os.environ["FIREBASE_SERVICE_ACCOUNT_PATH"] = "/nonexistent/firebase.json"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
async def app():
    """
    Application complète (app.main + routes /game de api.index), avec son
    lifespan exécuté : httpx.ASGITransport ne déclenche pas le lifespan seul,
    sans quoi le moteur de jeu ne serait jamais chargé.
    """
    from api.index import app as fastapi_app

    async with fastapi_app.router.lifespan_context(fastapi_app):
        yield fastapi_app


@pytest.fixture(scope="session")
async def client(app):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
