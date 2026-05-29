# api/index.py
# ─────────────────────────────────────────────────────────────────
# Toutes les routes de jeu existantes sont INCHANGÉES.
# Les nouveaux routers auth/users/leaderboard sont greffés ici.
# ─────────────────────────────────────────────────────────────────
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Tuple, Optional
from api.models import GameState, POINTS_LETTRES
from api.game_logic import GameEngine, AIDifficulty, AI_CONFIG
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# ── Initialisation Firebase + DB au démarrage ─────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Firebase
    try:
        from app.core.firebase import init_firebase
        init_firebase()
    except Exception as e:
        print(f"⚠️  Firebase non initialisé : {e}")

    # Base de données PostgreSQL
    try:
        # ⚠️ Import models EN PREMIER pour que SQLAlchemy connaisse les tables
        from app.db import models as _models  # noqa
        from app.db.database import init_db, Base
        init_db()

        # Ré-importer engine APRÈS init_db() pour avoir la valeur à jour
        from app.db.database import engine as db_engine
        if db_engine is not None:
            async with db_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("✅ Tables DB créées/vérifiées.")
    except Exception as e:
        print(f"⚠️  DB non initialisée : {e}")

    yield

    try:
        from app.db.database import engine as db_engine
        if db_engine:
            await db_engine.dispose()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan)

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8081",
    "https://scrabble-full-stack.vercel.app",
    "https://scrabble-full-stack-mup1.vercel.app",
    # Capacitor (apps natives)
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Nouveaux routers auth/users/leaderboard ───────────────────────
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.leaderboard.router import router as leaderboard_router

app.include_router(auth_router,        prefix="/api/v2")
app.include_router(users_router,       prefix="/api/v2")
app.include_router(leaderboard_router, prefix="/api/v2")

# ── Moteur de jeu existant ────────────────────────────────────────
DICTIONARY_PATH = BASE_DIR / "dictionnaire.txt"
game_engine = GameEngine(dictionary_path=str(DICTIONARY_PATH))

print("BOOT START")
print("BASE_DIR:", BASE_DIR)
print("DICTIONARY_PATH:", DICTIONARY_PATH)
print("FILE EXISTS:", DICTIONARY_PATH.exists())


# ---------------------------------------------------------------------------
# Routes utilitaires — INCHANGÉES
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Scrabble API v2 — Game + Auth"}


@app.get("/game/difficulties")
def list_difficulties():
    return {
        key: {"label": val["label"], "think_delay_ms": val["think_delay_ms"]}
        for key, val in AI_CONFIG.items()
    }


# ---------------------------------------------------------------------------
# Démarrage et statut — INCHANGÉS
# ---------------------------------------------------------------------------

@app.post("/game/start", response_model=GameState)
async def start_game(
    player_names: List[str],
    difficulty: str = Query(default=AIDifficulty.MEDIUM, description="Niveau de l'IA")
):
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    if difficulty not in AI_CONFIG:
        raise HTTPException(status_code=400, detail=f"Niveau invalide. Choisissez parmi: {list(AI_CONFIG.keys())}")
    return game_engine.start_new_game(player_names, difficulty=difficulty)


@app.get("/game/status/{game_id}", response_model=GameState)
async def get_status(game_id: str):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
    return game


# ---------------------------------------------------------------------------
# Actions de jeu — INCHANGÉES
# ---------------------------------------------------------------------------

@app.post("/game/pass/{game_id}")
async def pass_turn(game_id: str, player_id: int):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
 
    # FIX: Log détaillé pour diagnostiquer les désynchronisations
    current_idx = game.current_player_index
    current_player = game.players[current_idx]
    if current_player.id != player_id:
        # Fournir un message clair indiquant l'état actuel
        raise HTTPException(
            status_code=400,
            detail=(
                f"Ce n'est pas le tour de ce joueur. "
                f"Tour actuel : joueur id={current_player.id} ({current_player.name}). "
                f"Reçu : player_id={player_id}."
            )
        )
 
    success, message = game_engine.pass_turn(game_id, player_id)
    game = game_engine.get_game(game_id)
    if not success or not game:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Tour passé.", "game_state": game}
 
 
@app.post("/game/play/{game_id}")
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
 
    # FIX: même log détaillé
    current_idx = game.current_player_index
    current_player = game.players[current_idx]
    if current_player.id != player_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Ce n'est pas le tour de ce joueur. "
                f"Tour actuel : joueur id={current_player.id} ({current_player.name}). "
                f"Reçu : player_id={player_id}."
            )
        )
 
    success, message = game_engine.play_word(game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": "Mot joué et score mis à jour.", "game_state": game_engine.get_game(game_id)}


@app.post("/game/swap/{game_id}")
async def swap_tiles(game_id: str, player_id: int, letters: List[str]):
    success, message = game_engine.swap_tiles(game_id, player_id, letters)
    game = game_engine.get_game(game_id)
    if not success or not game:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Lettres échangées. Tour passé.", "game_state": game}


@app.post("/game/shuffle/{game_id}")
async def shuffle_rack(game_id: str, player_id: int):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
    try:
        game_engine.shuffle_rack(game, player_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack: {str(e)}")
    return {"message": "Rack mélangé.", "game_state": game}


# ---------------------------------------------------------------------------
# Tour de l'IA — INCHANGÉ
# ---------------------------------------------------------------------------

@app.post("/game/ai/play/{game_id}")
async def ai_play_turn(game_id: str):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")

    current_player = game.players[game.current_player_index]
    if not current_player.is_ai:
        raise HTTPException(status_code=400, detail="Ce n'est pas le tour de l'IA.")

    success, message = await asyncio.to_thread(
        game_engine.ai_play_turn, game_id, current_player.id
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)

    difficulty = game_engine.get_difficulty(game_id)
    config = AI_CONFIG[difficulty]

    return {
        "message": message,
        "difficulty": difficulty,
        "difficulty_label": config["label"],
        "think_delay_ms": config["think_delay_ms"],
        "game_state": game_engine.get_game(game_id),
    }

# Décommenté pour éviter les conflits avec le développement et les tests locaux
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
# Fin du fichier: backend/api.py