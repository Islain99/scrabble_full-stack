from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Tuple, Optional
from models import GameState, POINTS_LETTRES # Assurez-vous d'importer les modèles nécessaires
from game_logic import GameEngine

app = FastAPI()

# Configuration CORS pour permettre au frontend React de communiquer
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "https://scrabble-full-stack.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialisation du moteur de jeu
game_engine = GameEngine(dictionary_path="./dictionnaire.txt") 

# NOTE: La variable `current_game_id` n'est plus nécessaire dans une architecture multi-partie
# et a été retirée.

# --- API Endpoints ---

## Démarrage et Statut de la Partie

@app.post("/game/start", response_model=GameState)
async def start_game(player_names: List[str]):
    """Démarre une nouvelle partie et retourne son ID."""
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    
    new_game = game_engine.start_new_game(player_names)
    return new_game

@app.get("/game/status/{game_id}", response_model=GameState)
async def get_status(game_id: str):
    """Obtient l'état actuel du jeu par son ID."""
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
    return game

## Actions de Jeu

@app.post("/game/play/{game_id}")
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    """Tente de jouer un mot dans une partie spécifique."""
    success, message = game_engine.play_word(game_id, player_id, placements)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
        
    # On récupère le GameState mis à jour pour le renvoyer au client
    return {"message": "Mot joué et score mis à jour.", "game_state": game_engine.get_game(game_id)}

@app.post("/game/pass/{game_id}")
async def pass_turn(game_id: str, player_id: int):
    """Passe le tour du joueur dans une partie spécifique."""
    success, message = game_engine.pass_turn(game_id, player_id)
    
    game = game_engine.get_game(game_id)
    if not success or not game:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
        
    return {"message": "Tour passé.", "game_state": game}

@app.post("/game/swap/{game_id}")
async def swap_tiles(game_id: str, player_id: int, letters: List[str]):
    """Échange des tuiles du rack du joueur dans une partie spécifique."""
    success, message = game_engine.swap_tiles(game_id, player_id, letters)
    
    game = game_engine.get_game(game_id)
    if not success or not game:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
        
    return {"message": "Lettres échangées. Tour passé.", "game_state": game}

## Action: Mélanger le Rack (Correction et Adaptation Multi-Partie)

# Le endpoint /game/shuffle doit maintenant inclure game_id
@app.post("/game/shuffle/{game_id}") 
async def shuffle_rack(game_id: str, player_id: int):
    """Mélange les lettres dans le rack du joueur pour une partie spécifique."""
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")
        
    # --- NOUVEAU: Implémenter la logique `shuffle_rack` dans GameEngine ---
    # Cette logique doit être ajoutée à game_logic.py:
    # `game_engine.shuffle_rack(game, player_id)`
    
    # Pour l'instant, nous faisons la vérification et l'appel si la méthode est implémentée dans game_logic:
    try:
        # Assumons que la méthode `shuffle_rack` existe et prend `game` et `player_id`
        game_engine.shuffle_rack(game, player_id) 
    except AttributeError:
        # Gérer le cas où `shuffle_rack` n'est pas encore définie dans GameEngine
        raise HTTPException(status_code=500, detail="Fonctionnalité de mélange (shuffle) non implémentée dans le moteur de jeu.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack: {str(e)}")
    
    return {"message": "Rack mélangé.", "game_state": game}

## Action: Tour de l'IA
@app.post("/game/ai/play/{game_id}")
async def ai_play_turn(game_id: str):
    """Déclenche le tour de l'IA pour la partie spécifiée."""
    game = game_engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} non trouvée.")

    current_player_index = game.current_player_index
    current_player = game.players[current_player_index]
    
    # Vérification essentielle: s'assurer que c'est bien le tour d'un joueur IA
    if not current_player.is_ai: 
        raise HTTPException(status_code=400, detail="Ce n'est pas le tour de l'IA.")

    success, message = game_engine.ai_play_turn(game_id, current_player.id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"message": f"Tour de l'IA terminé: {message}", "game_state": game_engine.get_game(game_id)}

# Fin du fichier: backend/api.py