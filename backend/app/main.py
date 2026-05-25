# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import get_settings
from app.core.firebase import init_firebase
from app.db.database import engine, Base
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.leaderboard.router import router as leaderboard_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialisation au démarrage, nettoyage à l'arrêt."""
    # Initialiser Firebase Admin
    init_firebase()

    # Créer les tables si elles n'existent pas (dev seulement — en prod utiliser Alembic)
    if not settings.is_production:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    yield

    # Fermer les connexions DB
    await engine.dispose()


app = FastAPI(
    title="Scrabble API",
    description="Backend Scrabble avec authentification Firebase + PostgreSQL",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── Middlewares ────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.is_production:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*.railway.app", "*.vercel.app", "localhost"])

# ── Routers ───────────────────────────────────────────────────────

app.include_router(auth_router,        prefix="/api/v2")
app.include_router(users_router,       prefix="/api/v2")
app.include_router(leaderboard_router, prefix="/api/v2")

# Les routes de jeu existantes restent sur /game (rétro-compatibilité)
# Si tu veux les protéger, importe et configure ici :
# from app.game.router import router as game_router
# app.include_router(game_router, prefix="/api/v2")


# ── Health check ──────────────────────────────────────────────────

@app.get("/health", tags=["Système"])
async def health():
    return {"status": "ok", "version": "2.0.0", "env": settings.APP_ENV}


@app.get("/", tags=["Système"])
async def root():
    return {"message": "Scrabble API v2 — Firebase Auth + PostgreSQL"}
