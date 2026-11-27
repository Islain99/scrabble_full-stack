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
from collections import OrderedDict
from typing import List, Tuple

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app  # ← instance unique, lifespan et middlewares inclus
from app.solo.store import solo_store
from api.models import GameState, GAME_LANGUAGES, DEFAULT_GAME_LANGUAGE
from api.game_logic import AIDifficulty, AI_CONFIG
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User


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


async def _load_game(engine, game_id: str) -> GameState:
    """
    La partie, rechargée depuis la base si elle n'est plus en mémoire
    (redéploiement, redémarrage, inactivité). 404 si elle n'existe nulle part.
    """
    game = await solo_store.load(engine, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail=f"Partie {game_id} introuvable.")
    return game


async def _save_game(engine, game: GameState) -> GameState:
    """
    Enregistre la partie après un coup. Une partie terminée est libérée de la
    mémoire : on renvoie donc l'objet reçu, pas une nouvelle lecture du moteur.
    """
    await solo_store.save(engine, game, engine.get_difficulty(game.game_id))
    return game


def _check_turn(game: GameState, player_id: int) -> None:
    current_player = game.players[game.current_player_index]
    if current_player.id != player_id:
        raise HTTPException(
            status_code=400,
            detail=f"Ce n'est pas le tour de ce joueur. Tour actuel : {current_player.name} (id={current_player.id}).",
        )


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
    language: str = Query(default=DEFAULT_GAME_LANGUAGE),
):
    if len(player_names) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux joueurs.")
    if difficulty not in AI_CONFIG:
        valid = ", ".join(AI_CONFIG.keys())
        raise HTTPException(status_code=400, detail=f"Niveau invalide. Valeurs acceptées : {valid}")
    if language not in GAME_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Langue invalide. Valeurs acceptées : {', '.join(GAME_LANGUAGES)}")
    engine = _engine()
    if not engine.supports_language(language):
        raise HTTPException(status_code=503, detail=f"Dictionnaire indisponible pour la langue « {language} ».")
    # Méthode réelle : start_new_game(player_names, difficulty, language)
    game = engine.start_new_game(player_names, difficulty=difficulty, language=language)
    return await _save_game(engine, game)


# ── /game/status/{game_id} ────────────────────────────────────────

@app.get("/game/status/{game_id}", response_model=GameState, tags=["Jeu"])
async def get_status(game_id: str):
    return await _load_game(_engine(), game_id)


# ── /game/play/{game_id} ──────────────────────────────────────────

@app.post("/game/play/{game_id}", tags=["Jeu"])
async def play_word(game_id: str, player_id: int, placements: List[Tuple[int, int, str]]):
    engine = _engine()
    game = await _load_game(engine, game_id)
    _check_turn(game, player_id)
    # Méthode réelle : play_word(game_id, player_id, placements) → (bool, str)
    success, message = engine.play_word(game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": "Mot joué et score mis à jour.", "game_state": await _save_game(engine, game)}


# ── /game/pass/{game_id} ──────────────────────────────────────────

@app.post("/game/pass/{game_id}", tags=["Jeu"])
async def pass_turn(game_id: str, player_id: int):
    engine = _engine()
    game = await _load_game(engine, game_id)
    _check_turn(game, player_id)
    # Méthode réelle : pass_turn(game_id, player_id) → (bool, str)
    success, message = engine.pass_turn(game_id, player_id)
    if not success:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Tour passé.", "game_state": await _save_game(engine, game)}


# ── /game/swap/{game_id} ──────────────────────────────────────────

@app.post("/game/swap/{game_id}", tags=["Jeu"])
async def swap_tiles(game_id: str, player_id: int, letters: List[str]):
    engine = _engine()
    game = await _load_game(engine, game_id)
    # Méthode réelle : swap_tiles(game_id, player_id, letters) → (bool, str)
    success, message = engine.swap_tiles(game_id, player_id, letters)
    if not success:
        raise HTTPException(status_code=400, detail=message or "Erreur inconnue.")
    return {"message": "Lettres échangées. Tour passé.", "game_state": await _save_game(engine, game)}


# ── /game/shuffle/{game_id} ───────────────────────────────────────

@app.post("/game/shuffle/{game_id}", tags=["Jeu"])
async def shuffle_rack(game_id: str, player_id: int):
    engine = _engine()
    game = await _load_game(engine, game_id)
    try:
        # Méthode réelle : shuffle_rack(game_state, player_id)
        engine.shuffle_rack(game, player_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Impossible de mélanger le rack : {exc}")
    return {"message": "Rack mélangé.", "game_state": await _save_game(engine, game)}


# ── /game/abandon/{game_id} ───────────────────────────────────────

@app.post("/game/abandon/{game_id}", tags=["Jeu"])
async def abandon_game(game_id: str, player_id: int):
    """
    Le joueur abandonne la partie.
    Marque la partie FINISHED, désigne l'adversaire gagnant, libère la mémoire.
    Retourne le GameState final pour affichage et sauvegarde côté client.
    """
    engine = _engine()
    await _load_game(engine, game_id)
    difficulty = engine.get_difficulty(game_id)   # lu avant que abandon_game ne l'efface
    # Méthode réelle : abandon_game(game_id, player_id) → (bool, str, GameState|None)
    success, message, final_state = engine.abandon_game(game_id, player_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    await solo_store.save(engine, final_state, difficulty)
    return {"message": message, "game_state": final_state}


# ── /game/ai/play/{game_id} ───────────────────────────────────────

@app.post("/game/ai/play/{game_id}", tags=["Jeu"])
async def ai_play_turn(game_id: str):
    engine = _engine()
    game = await _load_game(engine, game_id)
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
        # Coup joué, structuré : le client compose le message dans sa langue
        # {"kind": "play", "word", "score"} | {"kind": "swap", "count"} | {"kind": "pass"}
        "move": engine.last_ai_move.pop(game_id, None),
        "game_state": await _save_game(engine, game),
    }


# ── /game/hint/{game_id} (lot A3) ─────────────────────────────────
# Indice payant en crédits : meilleur coup possible pour le chevalet du joueur.
# Redemander l'indice sans avoir joué (même chevalet, même plateau) ne recoûte rien.

_HINTS: "OrderedDict[str, tuple]" = OrderedDict()      # game_id → (signature, indice)
_HINTS_MAX = 500
HINT_TIMEOUT_S = 8.0


def _hint_signature(game: GameState, player) -> tuple:
    return (len(game.moves), tuple(sorted(t.letter for t in player.rack)))


@app.post("/game/hint/{game_id}", tags=["Jeu"])
async def get_hint(game_id: str, player_id: int, user: User = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    from app.economy import service as economy
    from app.economy.models import CreditTransaction

    engine = _engine()
    game = await _load_game(engine, game_id)
    if getattr(game.status, "value", game.status) == "FINISHED":
        raise HTTPException(status_code=400, detail="La partie est terminée.")
    _check_turn(game, player_id)
    player = game.players[game.current_player_index]
    if player.is_ai:
        raise HTTPException(status_code=400, detail="Ce n'est pas le tour du joueur.")

    rules = await economy.get_rules(db)
    if not rules.enabled:
        raise HTTPException(status_code=403, detail="Les indices sont désactivés pour le moment.")

    used = int((await db.execute(select(func.count(CreditTransaction.id)).where(
        CreditTransaction.user_id == user.id, CreditTransaction.kind == "hint",
        CreditTransaction.ref.like(f"{game_id}#%"),
    ))).scalar_one() or 0)
    left = lambda n: None if not rules.hints_per_game else max(rules.hints_per_game - n, 0)   # noqa: E731

    signature = _hint_signature(game, player)
    cached = _HINTS.get(game_id)
    if cached and cached[0] == signature:
        return {"hint": cached[1], "charged": 0, "repeat": True, "credits": user.credits or 0,
                "hints_used": used, "hints_left": left(used)}

    if rules.hints_per_game and used >= rules.hints_per_game:
        raise HTTPException(status_code=429, detail="Plus d'indice disponible pour cette partie.")
    if (user.credits or 0) < rules.hint_price:
        raise HTTPException(status_code=402, detail=f"Solde insuffisant : {user.credits or 0} crédits, "
                                                    f"{rules.hint_price} nécessaires.")
    try:
        hint = await asyncio.wait_for(asyncio.to_thread(engine.suggest_move, game_id, player_id), HINT_TIMEOUT_S)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="L'indice prend trop de temps. Réessayez.")
    if hint is None:
        # Aucun mot possible : rien à payer
        return {"hint": None, "charged": 0, "repeat": False, "credits": user.credits or 0,
                "hints_used": used, "hints_left": left(used)}
    try:
        await economy.apply(db, user, -rules.hint_price, "hint", ref=f"{game_id}#{used + 1}",
                            note=f"{hint['word']} ({hint['score']} pts)", record_zero=True)
    except economy.InsufficientCredits as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    _HINTS[game_id] = (signature, hint)
    _HINTS.move_to_end(game_id)
    while len(_HINTS) > _HINTS_MAX:
        _HINTS.popitem(last=False)
    return {"hint": hint, "charged": rules.hint_price, "repeat": False, "credits": user.credits or 0,
            "hints_used": used + 1, "hints_left": left(used + 1)}


# ── /game/validate ────────────────────────────────────────────────

@app.get("/game/validate", tags=["Jeu"])
async def validate_word(word: str, language: str = Query(default=DEFAULT_GAME_LANGUAGE)):
    if language not in GAME_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Langue invalide. Valeurs acceptées : {', '.join(GAME_LANGUAGES)}")
    # Méthode réelle : is_word_valid(word, language) → bool
    return {"word": word.upper(), "language": language, "valid": _engine().is_word_valid(word, language)}
