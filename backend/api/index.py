# api/index.py
from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Tuple
from api.models import GameState, POINTS_LETTRES
from api.game_logic import GameEngine, AIDifficulty, AI_CONFIG
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.core.firebase import init_firebase
        init_firebase()
    except Exception as e:
        print(f"⚠️  Firebase non initialisé : {e}")

    try:
        from app.db.database import init_db, engine, Base
        init_db()
        if engine is not None:
            async with engine.begin() as conn:
                from app.db import models  # noqa
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

from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.leaderboard.router import router as leaderboard_router

app.include_router(auth_router,        prefix="/api/v2")
app.include_router(users_router,       prefix="/api/v2")
app.include_router(leaderboard_router, prefix="/api/v2")

DICTIONARY_PATH = BASE_DIR / "dictionnaire.txt"
game_engine = GameEngine(dictionary_path=str(DICTIONARY_PATH))

print("BOOT START")
print("BASE_DIR:", BASE_DIR)
print("DICTIONARY_PATH:", DICTIONARY_PATH)
print("FILE EXISTS:", DICTIONARY_PATH.exists())


@app.get("/")
def root():
    return {"message": "Scrabble API v2 — Game + Auth"}


@app.get("/game/difficulties")
def list_difficulties():
    return {
        key: {"label": val["label"], "think_delay_ms": val["think_delay_ms"]}
        for key, val in AI_CONFIG.items()
    }


@app.post("/game/start", response_model=GameState)
async def start_game(
    player_names: List[str],
    difficulty: str = Query(default=AIDifficulty.MEDIUM),
):
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    if difficulty not in AI_CONFIG:
        raise HTTPException(status_code=400, detail=f"Niveau invalide. Choisissez parmi : {list(AI_CONFIG.keys())}")
    return game_engine.start_new_game(player_names, difficulty=difficulty)


@app.get("/game/status/{game_id}", response_model=GameState)
async def get_status(game_id: str):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    return game


@app.post("/game/play/{game_id}")
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    current_player = game.players[game.current_player_index]
    if current_player.id != player_id:
        raise HTTPException(status_code=400, detail=f"Ce n'est pas le tour de ce joueur. Tour actuel : {current_player.name} (id={current_player.id}).")
    success, message = game_engine.play_word(game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": "Mot joué et score mis à jour.", "game_state": game_engine.get_game(game_id)}


@app.post("/game/pass/{game_id}")
async def pass_turn(game_id: str, player_id: int):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    current_player = game.players[game.current_player_index]
    if current_player.id != player_id:
        raise HTTPException(status_code=400, detail=f"Ce n'est pas le tour de ce joueur. Tour actuel : {current_player.name} (id={current_player.id}).")
    success, message = game_engine.pass_turn(game_id, player_id)
    game = game_engine.get_game(game_id)
    if not success or not game:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Tour passé.", "game_state": game}


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
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    try:
        game_engine.shuffle_rack(game, player_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack : {str(e)}")
    return {"message": "Rack mélangé.", "game_state": game}


# ── ABANDON ───────────────────────────────────────────────────────

@app.post("/game/abandon/{game_id}")
async def abandon_game(game_id: str, player_id: int):
    """
    Le joueur abandonne la partie.
    - Marque la partie FINISHED, désigne l'adversaire gagnant
    - Libère la mémoire (supprime active_games[game_id])
    - Retourne le GameState final pour affichage et sauvegarde côté client
    """
    success, message, final_state = game_engine.abandon_game(game_id, player_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "message": message,
        "game_state": final_state,
    }


# ── TOUR IA ───────────────────────────────────────────────────────

@app.post("/game/ai/play/{game_id}")
async def ai_play_turn(game_id: str):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
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