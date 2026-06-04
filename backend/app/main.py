# app/main.py
#
# Point de vérité unique pour l'application FastAPI.
# api/index.py importe `app` depuis ici — ne plus y définir de lifespan,
# de middlewares ou de routers.
#
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import get_settings
from app.core.firebase import init_firebase
from app.db.database import init_db, engine, Base
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.leaderboard.router import router as leaderboard_router

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Chargement du dictionnaire (partagé avec les routes /game) ────
# Le chemin est résolu depuis api/dictionnaire.txt, quel que soit
# le répertoire de travail au lancement.
_API_DIR = Path(__file__).resolve().parent.parent / "api"
DICTIONARY_PATH = _API_DIR / "dictionnaire.txt"


def _load_game_engine():
    """Charge le GameEngine dans un thread pour ne pas bloquer la boucle async."""
    from api.game_logic import GameEngine
    engine_obj = GameEngine(dictionary_path=str(DICTIONARY_PATH))
    logger.info(
        "Dictionnaire chargé : %s (%s)",
        DICTIONARY_PATH,
        "trouvé" if DICTIONARY_PATH.exists() else "INTROUVABLE",
    )
    return engine_obj


# ── Lifespan ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    """
    Séquence de démarrage / arrêt de l'application.

    Démarrage :
      1. Firebase Admin SDK
      2. Connexion à la base de données (SQLAlchemy async)
      3. Chargement du dictionnaire (thread séparé)

    Arrêt :
      • Fermeture du pool de connexions DB
    """
    # 1. Firebase
    try:
        init_firebase()
        logger.info("Firebase Admin SDK initialisé.")
    except Exception as exc:
        logger.warning("Firebase non initialisé : %s", exc)

    # 2. Base de données
    try:
        init_db()
        if engine is not None:
            # En dev uniquement : crée les tables manquantes sans migration.
            # En prod, Alembic (lancé par le Procfile) gère le schéma.
            if not settings.is_production:
                async with engine.begin() as conn:
                    from app.db import models  # noqa — enregistre les modèles
                    await conn.run_sync(Base.metadata.create_all)
                logger.info("Tables DB créées / vérifiées (mode dev).")
            else:
                logger.info("Mode production — schéma géré par Alembic.")
    except Exception as exc:
        logger.warning("DB non initialisée : %s", exc)

    # 3. Dictionnaire de jeu (I/O bloquant → thread pool)
    try:
        application.state.game_engine = await asyncio.to_thread(_load_game_engine)
    except Exception as exc:
        logger.warning("Dictionnaire non chargé : %s", exc)
        application.state.game_engine = None

    yield

    # ── Arrêt ──────────────────────────────────────────────────────
    try:
        if engine is not None:
            await engine.dispose()
            logger.info("Pool de connexions DB fermé.")
    except Exception as exc:
        logger.warning("Erreur à la fermeture de la DB : %s", exc)


# ── Application ────────────────────────────────────────────────────

app = FastAPI(
    title="Scrabble API",
    description="Backend Scrabble — Firebase Auth + PostgreSQL + Moteur de jeu",
    version="2.1.0",
    lifespan=lifespan,
    # Swagger désactivé en production
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── Middlewares ────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

if settings.is_production:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*.railway.app", "*.vercel.app", "localhost"],
    )

# ── Routers API v2 ────────────────────────────────────────────────

app.include_router(auth_router,        prefix="/api/v2")
app.include_router(users_router,       prefix="/api/v2")
app.include_router(leaderboard_router, prefix="/api/v2")

# ── Routes système ────────────────────────────────────────────────

@app.get("/health", tags=["Système"])
async def health():
    """
    Health check enrichi.
    Vérifie la connectivité DB et l'état du dictionnaire.
    """
    from sqlalchemy import text
    from app.db.database import AsyncSessionLocal

    db_status = "disabled"
    if AsyncSessionLocal is not None:
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception as exc:
            db_status = f"error: {exc}"

    dict_status = (
        "loaded" if getattr(app.state, "game_engine", None) is not None
        else "not loaded"
    )

    return {
        "status": "ok",
        "version": "2.1.0",
        "env": settings.APP_ENV,
        "db": db_status,
        "dictionary": dict_status,
    }


@app.get("/", tags=["Système"])
async def root():
    return {"message": "Scrabble API v2.1 — Firebase Auth + PostgreSQL"}