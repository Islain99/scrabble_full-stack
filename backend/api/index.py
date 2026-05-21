from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Tuple, Optional
from api.models import GameState, POINTS_LETTRES
from api.game_logic import GameEngine, AIDifficulty, AI_CONFIG
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://scrabble-full-stack.vercel.app",
    "https://scrabble-full-stack-mup1.vercel.app",
    
    # --- Ajouts Capacitor (apps natives) ---
    "capacitor://localhost",   # iOS
    "http://localhost",        # Android (WebView)
    "https://localhost"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DICTIONARY_PATH = BASE_DIR / "dictionnaire.txt"
game_engine = GameEngine(dictionary_path=str(DICTIONARY_PATH))

print("BOOT START")
print("BASE_DIR:", BASE_DIR)
print("DICTIONARY_PATH:", DICTIONARY_PATH)
print("FILE EXISTS:", DICTIONARY_PATH.exists())


# ---------------------------------------------------------------------------
# Routes utilitaires
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "API running"}


@app.get("/game/difficulties")
def list_difficulties():
    """Retourne la liste des niveaux de difficulté disponibles."""
    return {
        key: {"label": val["label"], "think_delay_ms": val["think_delay_ms"]}
        for key, val in AI_CONFIG.items()
    }


# ---------------------------------------------------------------------------
# Démarrage et statut
# ---------------------------------------------------------------------------

@app.post("/game/start", response_model=GameState)
async def start_game(
    player_names: List[str],
    difficulty: str = Query(default=AIDifficulty.MEDIUM, description="Niveau de l'IA: easy | medium | hard")
):
    """Démarre une nouvelle partie avec le niveau d'IA choisi."""
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    if difficulty not in AI_CONFIG:
        raise HTTPException(
            status_code=400,
            detail=f"Niveau invalide. Choisissez parmi: {list(AI_CONFIG.keys())}"
        )
    new_game = game_engine.start_new_game(player_names, difficulty=difficulty)
    return new_game


@app.get("/game/status/{game_id}", response_model=GameState)
async def get_status(game_id: str):
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
    return game


# ---------------------------------------------------------------------------
# Actions de jeu
# ---------------------------------------------------------------------------

@app.post("/game/play/{game_id}")
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    success, message = game_engine.play_word(game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": "Mot joué et score mis à jour.", "game_state": game_engine.get_game(game_id)}


@app.post("/game/pass/{game_id}")
async def pass_turn(game_id: str, player_id: int):
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
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
    try:
        game_engine.shuffle_rack(game, player_id)
    except AttributeError:
        raise HTTPException(status_code=500, detail="Fonctionnalité shuffle non implémentée.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack: {str(e)}")
    return {"message": "Rack mélangé.", "game_state": game}


# ---------------------------------------------------------------------------
# Tour de l'IA
# ---------------------------------------------------------------------------

@app.post("/game/ai/play/{game_id}")
async def ai_play_turn(game_id: str):
    """Déclenche le tour de l'IA avec le niveau configuré à la création de la partie."""
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")

    current_player = game.players[game.current_player_index]
    if not current_player.is_ai:
        raise HTTPException(status_code=400, detail="Ce n'est pas le tour de l'IA.")

    success, message = game_engine.ai_play_turn(game_id, current_player.id)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    # Inclure le niveau dans la réponse pour que le frontend puisse afficher l'info
    difficulty = game_engine.get_difficulty(game_id)
    config = AI_CONFIG[difficulty]

    return {
        "message": message,
        "difficulty": difficulty,
        "difficulty_label": config["label"],
        "think_delay_ms": config["think_delay_ms"],
        "game_state": game_engine.get_game(game_id)
    }

# Décommenté pour éviter les conflits avec le développement et les tests locaux
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
# Fin du fichier: backend/api.py