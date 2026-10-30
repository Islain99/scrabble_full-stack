# app/main.py
#
# Point de vérité unique pour l'application FastAPI.
# api/index.py importe `app` depuis ici.
#
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

# Le logging doit être configuré AVANT tout autre import applicatif
# pour que les modules qui créent leur logger au chargement héritent
# de la bonne configuration.
from app.core.logging_config import setup_logging
setup_logging()

from app.core.config import get_settings
from app.core.firebase import init_firebase
from app.db import database as db
from app.db.database import init_db, Base
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.leaderboard.router import router as leaderboard_router
from app.multiplayer.router import router as multiplayer_router
from app.friends.router import router as friends_router, users_router as friends_users_router
from app.notifications.router import router as notifications_router
from app.chat.router import router as chat_router
from app.push.router import router as push_router
from app.account.router import router as account_router

# NB : les migrations Alembic sont lancées par la commande de démarrage
# (railway.json : `alembic upgrade head && uvicorn ...`), jamais à l'import.
# Les lancer ici les exécutait deux fois en prod, plantait l'import sans DB
# (tests, CI) et écrasait la config de logging via fileConfig().

logger = logging.getLogger(__name__)
settings = get_settings()

_API_DIR = Path(__file__).resolve().parent.parent / "api"
DICTIONARY_PATH = _API_DIR / "dictionnaire.txt"


def _load_game_engine():
    """Charge le GameEngine dans un thread pour ne pas bloquer la boucle async."""
    from api.game_logic import GameEngine
    ge = GameEngine(dictionary_path=str(DICTIONARY_PATH))
    logger.info(
        "Dictionnaire chargé : %s (%s)",
        DICTIONARY_PATH,
        "trouvé" if DICTIONARY_PATH.exists() else "INTROUVABLE",
    )
    return ge


# ── Lifespan ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    logger.info("Démarrage de l'application (env=%s)", settings.APP_ENV)

    # 1. Firebase
    try:
        init_firebase()
    except Exception as exc:
        logger.warning("Firebase non initialisé : %s", exc)

    # 2. Base de données
    try:
        init_db()
        # `db.engine` (et non un `engine` importé) : init_db() réassigne la
        # globale du module, un nom importé resterait figé à None.
        if db.engine is not None:
            if not settings.is_production:
                async with db.engine.begin() as conn:
                    from app.db import models  # noqa
                    from app.multiplayer import models as _mp_models  # noqa — table multiplayer_games
                    from app.solo import models as _solo_models  # noqa — table solo_games
                    from app.friends import models as _friends_models  # noqa — amis, groupes, blocages
                    from app.notifications import models as _notif_models  # noqa — invitations à jouer
                    from app.chat import models as _chat_models  # noqa — messagerie
                    from app.push import models as _push_models  # noqa — jetons des notifications push
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

    # 4. Nettoyage périodique des parties (mémoire + base) — app/solo/store.py
    from app.solo.store import solo_store
    cleanup_task = asyncio.create_task(
        solo_store.run_cleanup_loop(lambda: getattr(application.state, "game_engine", None))
    )
    # … et des salles multijoueur — app/multiplayer/cleanup.py
    from app.multiplayer.cleanup import run_cleanup_loop as run_mp_cleanup
    mp_cleanup_task = asyncio.create_task(run_mp_cleanup())
    # … et minuteur des parties multijoueur (passe automatique) — app/multiplayer/timer.py
    from app.multiplayer.timer import run_timer_loop
    mp_timer_task = asyncio.create_task(
        run_timer_loop(lambda: getattr(application.state, "game_engine", None))
    )
    # … et de la messagerie (salon universel, chats de partie) — app/chat/cleanup.py
    from app.chat.cleanup import run_chat_cleanup_loop
    chat_cleanup_task = asyncio.create_task(run_chat_cleanup_loop())

    logger.info("Application prête.")
    yield

    # ── Arrêt ──────────────────────────────────────────────────────
    for task in (cleanup_task, mp_cleanup_task, mp_timer_task, chat_cleanup_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    try:
        if db.engine is not None:
            await db.engine.dispose()
            logger.info("Pool de connexions DB fermé.")
    except Exception as exc:
        logger.warning("Erreur à la fermeture de la DB : %s", exc)


# ── Application ────────────────────────────────────────────────────

app = FastAPI(
    title="Scrabble API",
    description="Backend Scrabble — Firebase Auth + PostgreSQL + Moteur de jeu",
    version="2.1.0",
    lifespan=lifespan,
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
app.include_router(multiplayer_router, prefix="/api/v2")
app.include_router(friends_router,     prefix="/api/v2")
app.include_router(friends_users_router, prefix="/api/v2")
app.include_router(notifications_router, prefix="/api/v2")
app.include_router(chat_router,          prefix="/api/v2")
app.include_router(push_router,          prefix="/api/v2")
app.include_router(account_router,       prefix="/api/v2")
# ── Routes système ────────────────────────────────────────────────

@app.get("/health", tags=["Système"])
async def health():
    """Health check enrichi — vérifie DB et dictionnaire."""
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