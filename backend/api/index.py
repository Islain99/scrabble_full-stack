# api/index.py
#
# Ce fichier est le point d'entrée Vercel (vercel.json) et Railway (Procfile).
# Il ne contient PLUS de lifespan, de middlewares, ni d'enregistrement de routers
# d'authentification — tout cela est centralisé dans app/main.py.
#
# Son seul rôle :
#   1. Importer `app` depuis app.main  (source unique de vérité)
#   2. Enregistrer les routes /game/* sur cette même instance
#
from fastapi import HTTPException, Query
from typing import List
from pathlib import Path

from app.main import app  # ← instance unique, lifespan et middlewares inclus
from api.models import GameState, POINTS_LETTRES
from api.game_logic import AIDifficulty, AI_CONFIG

# ── Routes /game ──────────────────────────────────────────────────
# Le GameEngine est chargé dans app.state.game_engine par le lifespan de app/main.py.
# On l'accède via `app.state` pour éviter un import global bloquant.


def _engine():
    """Raccourci : récupère le GameEngine depuis app.state."""
    ge = getattr(app.state, "game_engine", None)
    if ge is None:
        raise HTTPException(
            status_code=503,
            detail="Moteur de jeu non disponible — dictionnaire introuvable ou en cours de chargement.",
        )
    return ge


@app.get("/game/difficulties", tags=["Jeu"])
def list_difficulties():
    return {
        key: {"label": val["label"], "think_delay_ms": val["think_delay_ms"]}
        for key, val in AI_CONFIG.items()
    }


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
    return _engine().start_game(player_names, difficulty)


@app.post("/game/play", response_model=GameState, tags=["Jeu"])
async def play_move(game_state: GameState, word: str, position: List[int], direction: str):
    return await _engine().play_move(game_state, word, position, direction)


@app.post("/game/skip", response_model=GameState, tags=["Jeu"])
async def skip_turn(game_state: GameState):
    return await _engine().skip_turn(game_state)


@app.post("/game/exchange", response_model=GameState, tags=["Jeu"])
async def exchange_tiles(game_state: GameState, tiles: List[str]):
    return await _engine().exchange_tiles(game_state, tiles)


@app.post("/game/ai-move", response_model=GameState, tags=["Jeu"])
async def ai_move(game_state: GameState):
    return await _engine().ai_move(game_state)


@app.get("/game/validate", tags=["Jeu"])
async def validate_word(word: str):
    return {"word": word.upper(), "valid": _engine().validate_word(word)}