# app/multiplayer/router.py
#
# Routes multijoueur — 2 joueurs humains, temps réel via Firebase RTDB.
#
# Flux complet :
#   1. Joueur A  → POST /multiplayer/rooms          → crée la salle, reçoit room_id
#   2. Joueur B  → POST /multiplayer/rooms/{id}/join → rejoint, partie démarre
#   3. Chacun    → GET  /multiplayer/rooms/{id}      → lit l'état courant
#   4. Joueur actif → POST .../move | .../pass | .../swap → joue, état mis à jour
#   5. À chaque écriture DB → push dans Firebase RTDB (games/{room_id}/for_host
#      et games/{room_id}/for_guest) avec rack adverse masqué dans chaque chemin.
#
# FIX B2 — Fuite des racks via RTDB et REST :
#   Avant : _sync_rtdb poussait le game_state complet sur /games/{room_id}.
#   Chaque joueur pouvait lire le rack de son adversaire.
#   Après :
#     • _build_masked_state() remplace le rack adverse par des placeholders {"letter":"?"}
#     • _sync_rtdb() pousse deux payloads distincts :
#         /games/{room_id}/for_host  → rack invité masqué
#         /games/{room_id}/for_guest → rack hôte masqué
#     • GET /rooms/{id} filtre aussi le game_state selon le joueur demandeur.
#     • Le frontend écoute /games/{room_id}/for_host ou /for_guest selon myPlayerIndex.
#
# FIX B1 (antérieur) — scalar_one_or_none() sans LIMIT dans create_room levait
#   MultipleResultsFound si des salles orphelines existaient → 500 sans CORS.
#   Corrigé avec .limit(1) + .scalars().first().
#
import copy
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.game_logic import GameEngine
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.multiplayer.models import (
    CreateRoomResponse,
    MultiplayerGame,
    PlayMoveRequest,
    RoomStateResponse,
    RoomStatus,
    SwapRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/multiplayer", tags=["Multijoueur"])


# ── Helpers ───────────────────────────────────────────────────────

def _get_engine(request: Request) -> GameEngine:
    engine = getattr(request.app.state, "game_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Moteur de jeu non disponible.")
    return engine


def _room_to_response(room: MultiplayerGame) -> RoomStateResponse:
    return RoomStateResponse(
        room_id=room.room_id,
        status=room.status,
        current_user_id=room.current_user_id,
        winner_user_id=room.winner_user_id,
        host_score=room.host_score,
        guest_score=room.guest_score,
        game_state=room.game_state,
    )


async def _get_room_or_404(room_id: str, db: AsyncSession) -> MultiplayerGame:
    # room_id est UNIQUE — scalar_one_or_none() est sûr ici.
    result = await db.execute(
        select(MultiplayerGame).where(MultiplayerGame.room_id == room_id)
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Salle introuvable.")
    return room


def _build_masked_state(gs_dict: dict, viewer_index: int) -> dict:
    """
    Retourne une copie profonde du game_state avec le rack de l'adversaire masqué.
    Les tuiles adverses sont remplacées par {"letter": "?", "score": 0} pour
    préserver la taille du rack sans révéler les lettres.

    viewer_index : 0 = hôte voit son rack intact, invité masqué.
                   1 = invité voit son rack intact, hôte masqué.
    """
    masked = copy.deepcopy(gs_dict)
    opponent_index = 1 - viewer_index
    players = masked.get("players") or []
    if len(players) > opponent_index:
        opp = players[opponent_index]
        rack_size = len(opp.get("rack") or [])
        opp["rack"] = [{"letter": "?", "score": 0}] * rack_size
    return masked


def _sync_rtdb(room_id: str, gs_dict: dict) -> None:
    """
    Pousse l'état de partie dans Firebase Realtime Database.

    Structure :
        /games/{room_id}/for_host  — rack de l'invité masqué
        /games/{room_id}/for_guest — rack de l'hôte masqué

    Chaque frontend écoute le chemin qui lui correspond (for_host ou for_guest)
    selon myPlayerIndex, et ne peut donc pas lire le rack adverse.

    Non bloquant : les erreurs sont loguées mais n'interrompent pas la réponse HTTP.
    """
    try:
        from firebase_admin import db as rtdb
        ref = rtdb.reference(f"/games/{room_id}")
        ref.set({
            "for_host":  _build_masked_state(gs_dict, viewer_index=0),
            "for_guest": _build_masked_state(gs_dict, viewer_index=1),
        })
        logger.debug("RTDB sync OK pour room %s", room_id)
    except Exception as exc:
        logger.warning("RTDB sync ignorée (room=%s) : %s", room_id, exc)


def _game_state_to_dict(game_state) -> dict:
    """Convertit un GameState Pydantic en dict JSON-sérialisable."""
    return game_state.model_dump()


def _player_index_for_user(game_state_dict: dict, user_id: int, room: MultiplayerGame) -> int:
    """
    Retourne l'index du joueur dans game_state.players correspondant à cet user_id.
    Convention : index 0 = hôte, index 1 = invité.
    """
    if user_id == room.host_user_id:
        return 0
    if user_id == room.guest_user_id:
        return 1
    raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")


def _current_user_id_from_state(game_state_dict: dict, room: MultiplayerGame) -> Optional[int]:
    """Déduit quel user_id doit jouer à partir de current_player_index."""
    idx = game_state_dict.get("current_player_index", 0)
    return room.host_user_id if idx == 0 else room.guest_user_id


# ── Routes ────────────────────────────────────────────────────────

@router.post(
    "/rooms",
    response_model=CreateRoomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une salle multijoueur",
)
async def create_room(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = _get_engine(request)

    # .limit(1) + .scalars().first() évite MultipleResultsFound sur salles orphelines.
    existing_result = await db.execute(
        select(MultiplayerGame)
        .where(
            MultiplayerGame.host_user_id == current_user.id,
            MultiplayerGame.status == RoomStatus.WAITING,
        )
        .limit(1)
    )
    if existing_result.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà une salle en attente. Rejoignez-la ou annulez-la.",
        )

    room_id = str(uuid.uuid4())
    room = MultiplayerGame(
        room_id=room_id,
        host_user_id=current_user.id,
        status=RoomStatus.WAITING,
    )
    db.add(room)
    await db.flush()

    logger.info("Salle créée : %s par user %d", room_id, current_user.id)

    return CreateRoomResponse(
        room_id=room_id,
        status=RoomStatus.WAITING,
        host_name=current_user.display_name,
    )


@router.post(
    "/rooms/{room_id}/join",
    response_model=RoomStateResponse,
    summary="Rejoindre une salle et démarrer la partie",
)
async def join_room(
    room_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = _get_engine(request)
    room = await _get_room_or_404(room_id, db)

    if room.status != RoomStatus.WAITING:
        raise HTTPException(status_code=409, detail=f"La salle est déjà {room.status}.")
    if room.host_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous êtes déjà l'hôte de cette salle.")

    host_result = await db.execute(select(User).where(User.id == room.host_user_id))
    host = host_result.scalar_one()

    game_state = engine.start_new_game(
        player_names=[host.display_name, current_user.display_name],
        difficulty="medium",
    )
    gs_dict = _game_state_to_dict(game_state)

    room.guest_user_id   = current_user.id
    room.status          = RoomStatus.ACTIVE
    room.game_state      = gs_dict
    room.current_user_id = room.host_user_id
    room.host_score      = 0
    room.guest_score     = 0
    await db.flush()

    _sync_rtdb(room_id, gs_dict)
    logger.info(
        "Partie multijoueur démarrée : room %s | %s vs %s",
        room_id, host.display_name, current_user.display_name,
    )

    # L'invité (viewer_index=1) reçoit son rack intact, hôte masqué.
    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=1)
    return response


@router.get(
    "/rooms/{room_id}",
    response_model=RoomStateResponse,
    summary="Lire l'état courant d'une salle",
)
async def get_room(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lecture de l'état complet de la partie (fallback polling si RTDB absent).
    Le game_state retourné a le rack adverse masqué selon le joueur demandeur.
    """
    room = await _get_room_or_404(room_id, db)

    if current_user.id not in (room.host_user_id, room.guest_user_id):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")

    viewer_index = 0 if current_user.id == room.host_user_id else 1
    response = _room_to_response(room)
    if response.game_state:
        response.game_state = _build_masked_state(response.game_state, viewer_index)
    return response


@router.post(
    "/rooms/{room_id}/move",
    response_model=RoomStateResponse,
    summary="Jouer un mot",
)
async def play_move(
    room_id: str,
    body: PlayMoveRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = _get_engine(request)
    room   = await _get_room_or_404(room_id, db)

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)
    engine.active_games[gs.game_id] = gs

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    placements = [(p["r"], p["c"], p["letter"]) for p in body.placements]
    success, message = engine.play_word(gs.game_id, player_id, placements)

    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_updated = engine.active_games[gs.game_id]
    gs_dict    = _game_state_to_dict(gs_updated)

    room.game_state      = gs_dict
    room.host_score      = gs_updated.players[0].score
    room.guest_score     = gs_updated.players[1].score if len(gs_updated.players) > 1 else None
    room.current_user_id = _current_user_id_from_state(gs_dict, room)

    if gs_updated.status.value == "FINISHED":
        room.status      = RoomStatus.FINISHED
        room.finished_at = datetime.now(timezone.utc)
        winner_idx = next(
            (i for i, p in enumerate(gs_updated.players) if p.name == gs_updated.winner_name),
            None,
        )
        if winner_idx is not None:
            room.winner_user_id = room.host_user_id if winner_idx == 0 else room.guest_user_id

    await db.flush()
    _sync_rtdb(room_id, gs_dict)

    # Le joueur actif reçoit son rack intact dans la réponse REST.
    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=player_idx)
    return response


@router.post(
    "/rooms/{room_id}/pass",
    response_model=RoomStateResponse,
    summary="Passer son tour",
)
async def pass_turn(
    room_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = _get_engine(request)
    room   = await _get_room_or_404(room_id, db)

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)
    engine.active_games[gs.game_id] = gs

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    success, message = engine.pass_turn(gs.game_id, player_id)
    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_updated = engine.active_games[gs.game_id]
    gs_dict    = _game_state_to_dict(gs_updated)

    room.game_state      = gs_dict
    room.current_user_id = _current_user_id_from_state(gs_dict, room)

    if gs_updated.status.value == "FINISHED":
        room.status      = RoomStatus.FINISHED
        room.finished_at = datetime.now(timezone.utc)

    await db.flush()
    _sync_rtdb(room_id, gs_dict)

    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=player_idx)
    return response


@router.post(
    "/rooms/{room_id}/swap",
    response_model=RoomStateResponse,
    summary="Échanger des lettres",
)
async def swap_tiles(
    room_id: str,
    body: SwapRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = _get_engine(request)
    room   = await _get_room_or_404(room_id, db)

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)
    engine.active_games[gs.game_id] = gs

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    success, message = engine.swap_tiles(gs.game_id, player_id, body.letters)
    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_updated = engine.active_games[gs.game_id]
    gs_dict    = _game_state_to_dict(gs_updated)

    room.game_state      = gs_dict
    room.current_user_id = _current_user_id_from_state(gs_dict, room)
    await db.flush()
    _sync_rtdb(room_id, gs_dict)

    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=player_idx)
    return response


@router.delete(
    "/rooms/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Annuler une salle en attente",
)
async def cancel_room(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seul l'hôte peut annuler une salle WAITING."""
    room = await _get_room_or_404(room_id, db)

    if room.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul l'hôte peut annuler la salle.")
    if room.status != RoomStatus.WAITING:
        raise HTTPException(status_code=409, detail="Impossible d'annuler une partie déjà démarrée.")

    await db.delete(room)
    await db.flush()
    logger.info("Salle %s annulée par user %d", room_id, current_user.id)