# api/index.py
#
# Point d'entrée Vercel (vercel.json) et Railway (Procfile).
# Ce fichier NE contient plus de lifespan, middlewares, ni routers d'auth —
# tout est centralisé dans app/main.py.
#
# Rôle unique :
#   1. Importer `app` depuis app.main  (source de vérité)
#   2. Enregistrer les routes /game/* sur cette même instance
#      en utilisant les vraies signatures de GameEngine.
#
import asyncio
from typing import List, Tuple

from fastapi import HTTPException, Query

from app.main import app  # ← instance unique, lifespan et middlewares inclus
from api.models import GameState
from api.game_logic import AIDifficulty, AI_CONFIG


# ── Accès au GameEngine ───────────────────────────────────────────
# Chargé dans app.state.game_engine par le lifespan de app/main.py.

def _engine():
    ge = getattr(app.state, "game_engine", None)
    if ge is None:
        raise HTTPException(
            status_code=503,
            detail="Moteur de jeu non disponible — dictionnaire introuvable ou en cours de chargement.",
        )
    return ge


# ── /game/difficulties ────────────────────────────────────────────

@app.get("/game/difficulties", tags=["Jeu"])
def list_difficulties():
    return {
        key: {"label": val["label"], "think_delay_ms": val["think_delay_ms"]}
        for key, val in AI_CONFIG.items()
    }


# ── /game/start ───────────────────────────────────────────────────

@app.post("/game/start", response_model=GameState, tags=["Jeu"])
async def start_game(
    player_names: List[str],
    difficulty: str = Query(default=AIDifficulty.MEDIUM),
):
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    if difficulty not in AI_CONFIG:
        valid = ", ".join(AI_CONFIG.keys())
        raise HTTPException(status_code=400, detail=f"Niveau invalide. Valeurs acceptées : {valid}")
    # Méthode réelle : start_new_game(player_names, difficulty)
    return _engine().start_new_game(player_names, difficulty=difficulty)


# ── /game/status/{game_id} ────────────────────────────────────────

@app.get("/game/status/{game_id}", response_model=GameState, tags=["Jeu"])
async def get_status(game_id: str):
    game = _engine().get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    return game


# ── /game/play/{game_id} ──────────────────────────────────────────

@app.post("/game/play/{game_id}", tags=["Jeu"])
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    engine = _engine()
    game = engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    current_player = game.players[game.current_player_index]
    if current_player.id != player_id:
        raise HTTPException(
            status_code=400,
            detail=f"Ce n'est pas le tour de ce joueur. Tour actuel : {current_player.name} (id={current_player.id}).",
        )
    # Méthode réelle : play_word(game_id, player_id, placements) → (bool, str)
    success, message = engine.play_word(game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": "Mot joué et score mis à jour.", "game_state": engine.get_game(game_id)}


# ── /game/pass/{game_id} ──────────────────────────────────────────

@app.post("/game/pass/{game_id}", tags=["Jeu"])
async def pass_turn(game_id: str, player_id: int):
    engine = _engine()
    game = engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    current_player = game.players[game.current_player_index]
    if current_player.id != player_id:
        raise HTTPException(
            status_code=400,
            detail=f"Ce n'est pas le tour de ce joueur. Tour actuel : {current_player.name} (id={current_player.id}).",
        )
    # Méthode réelle : pass_turn(game_id, player_id) → (bool, str)
    success, message = engine.pass_turn(game_id, player_id)
    updated = engine.get_game(game_id)
    if not success or not updated:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Tour passé.", "game_state": updated}


# ── /game/swap/{game_id} ──────────────────────────────────────────

@app.post("/game/swap/{game_id}", tags=["Jeu"])
async def swap_tiles(game_id: str, player_id: int, letters: List[str]):
    engine = _engine()
    # Méthode réelle : swap_tiles(game_id, player_id, letters) → (bool, str)
    success, message = engine.swap_tiles(game_id, player_id, letters)
    updated = engine.get_game(game_id)
    if not success or not updated:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Lettres échangées. Tour passé.", "game_state": updated}


# ── /game/shuffle/{game_id} ───────────────────────────────────────

@app.post("/game/shuffle/{game_id}", tags=["Jeu"])
async def shuffle_rack(game_id: str, player_id: int):
    engine = _engine()
    game = engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    try:
        # Méthode réelle : shuffle_rack(game_state, player_id)
        engine.shuffle_rack(game, player_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack : {exc}")
    return {"message": "Rack mélangé.", "game_state": game}


# ── /game/abandon/{game_id} ───────────────────────────────────────

@app.post("/game/abandon/{game_id}", tags=["Jeu"])
async def abandon_game(game_id: str, player_id: int):
    """
    Le joueur abandonne la partie.
    Marque la partie FINISHED, désigne l'adversaire gagnant, libère la mémoire.
    Retourne le GameState final pour affichage et sauvegarde côté client.
    """
    # Méthode réelle : abandon_game(game_id, player_id) → (bool, str, GameState|None)
    success, message, final_state = _engine().abandon_game(game_id, player_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message, "game_state": final_state}


# ── /game/ai/play/{game_id} ───────────────────────────────────────

@app.post("/game/ai/play/{game_id}", tags=["Jeu"])
async def ai_play_turn(game_id: str):
    engine = _engine()
    game = engine.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    current_player = game.players[game.current_player_index]
    if not current_player.is_ai:
        raise HTTPException(status_code=400, detail="Ce n'est pas le tour de l'IA.")
    # Méthode réelle : ai_play_turn(game_id, player_id) — bloquante → thread pool
    success, message = await asyncio.to_thread(
        engine.ai_play_turn, game_id, current_player.id
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    difficulty = engine.get_difficulty(game_id)
    config = AI_CONFIG[difficulty]
    return {
        "message": message,
        "difficulty": difficulty,
        "difficulty_label": config["label"],
        "think_delay_ms": config["think_delay_ms"],
        "game_state": engine.get_game(game_id),
    }


# ── /game/validate ────────────────────────────────────────────────

@app.get("/game/validate", tags=["Jeu"])
async def validate_word(word: str):
    # Méthode réelle : is_word_valid(word) → bool
    return {"word": word.upper(), "valid": _engine().is_word_valid(word)}