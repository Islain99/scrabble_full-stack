# app/multiplayer/router.py
#
# Routes multijoueur — 2 joueurs humains, temps réel via Firebase RTDB.
#
# Historique des corrections :
#   B1 : scalar_one_or_none() sans LIMIT → MultipleResultsFound → 500 sans CORS.
#        Fix : .limit(1) + .scalars().first() dans create_room.
#   B2 : _sync_rtdb poussait le game_state complet → fuite des racks adverses.
#        Fix : deux chemins RTDB (for_host / for_guest) avec rack masqué +
#              filtre identique sur la réponse REST.
#   B3 : _sync_rtdb() synchrone dans handlers async → bloquait l'event loop.
#        Fix : await asyncio.to_thread(_sync_rtdb, room_id, gs_dict).
#   B6 : pas de verrou DB sur les routes de mutation → race condition possible
#        si deux requêtes arrivent simultanément sur la même salle.
#        Fix : with_for_update=True dans _get_room_or_404() pour join, move,
#              pass, swap, cancel.
#   S1 : la partie était laissée dans la mémoire du moteur solo après chaque
#        action → GET /game/status/{game_id} (sans authentification) renvoyait
#        l'état complet, chevalet adverse compris.
#        Fix : _on_engine() — la partie n'est en mémoire que le temps de l'action.
#   R1 : salle et partie perdues après une actualisation (l'identifiant n'était
#        connu que de la page) ; un hôte qui actualisait restait bloqué (409).
#        Fix : GET /rooms/current ; POST /rooms renvoie la salle déjà en attente.
#   R2 : pas d'abandon, pas de délai d'inactivité, aucun nettoyage.
#        Fix : POST /rooms/{id}/resign, POST /rooms/{id}/claim-win (après
#              CLAIM_AFTER sans coup du joueur au trait), app/multiplayer/cleanup.py.
#   F1 : gagnant retrouvé par son nom → deux joueurs homonymes « gagnaient »
#        tous les deux ; égalité = victoire de l'hôte ; fin par passes sans
#        winner_user_id ni scores finaux.
#        Fix : _apply_result() — gagnant par winner_id (index), égalité =
#              winner_user_id None, scores et statut à jour quelle que soit la fin.
#   C1 : le code de salle était l'UUID complet (36 caractères à recopier).
#        Fix : code court de 6 caractères sans ambiguïté (pas de 0/O, 1/I/L),
#              saisi sans tenir compte de la casse ni des espaces.
#   C2 : les parties multijoueur n'entraient ni dans l'historique ni dans les
#        statistiques. Fix : _record_stats() à chaque fin de partie, côté serveur.
#   R0 : la Realtime Database ne stocke pas `null` : un plateau vide (225 cases
#        à null) disparaissait, un plateau entamé devenait un objet clairsemé,
#        un chevalet vide disparaissait → « Chargement du plateau… » sans fin.
#        Fix : _rtdb_payload() envoie chaque état sous forme de texte JSON
#              ({state: "<json>", v: 2}) ; le client le décode tel quel.
#   S2 : rien n'empêchait l'invité de lire /games/{room}/for_host dans RTDB.
#        Fix : le nœud porte les uid Firebase des joueurs (players/host,
#              players/guest) ; database.rules.json limite chaque chemin à
#              son joueur et interdit toute écriture côté client.
#
import asyncio
import copy
import json
import logging
import re
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.game_logic import GameEngine
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import GameHistory, User
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

# L'adversaire peut réclamer la victoire après ce délai sans coup du joueur au trait
CLAIM_AFTER = timedelta(minutes=10)


# Code de salle (C1) : 6 caractères, alphabet sans caractères ambigus
ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
ROOM_CODE_LENGTH   = 6

# Marqueur des parties multijoueur dans game_histories (colonne ai_difficulty)
HISTORY_MODE = "multiplayer"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite rend des dates sans fuseau : elles sont en UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


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
        host_user_id=room.host_user_id,
        guest_user_id=room.guest_user_id,
        current_user_id=room.current_user_id,
        winner_user_id=room.winner_user_id,
        host_score=room.host_score,
        guest_score=room.guest_score,
        game_state=room.game_state,
        last_action_at=_as_utc(room.updated_at),
        claim_after_s=int(CLAIM_AFTER.total_seconds()),
    )


async def _get_room_or_404(
    room_id: str,
    db: AsyncSession,
    for_update: bool = False,
) -> MultiplayerGame:
    """
    Récupère la salle ou lève 404.

    for_update=True : ajoute SELECT … FOR UPDATE → verrou ligne pour les routes
    de mutation (join, move, pass, swap, cancel). Évite les race conditions si
    deux requêtes arrivent simultanément sur la même salle.
    """
    # room_id est UNIQUE — scalar_one_or_none() est sûr ici.
    q = select(MultiplayerGame).where(MultiplayerGame.room_id == room_id)
    if for_update:
        q = q.with_for_update()
    result = await db.execute(q)
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Salle introuvable.")
    return room


def _build_masked_state(gs_dict: dict, viewer_index: int) -> dict:
    """
    Copie profonde du game_state avec le rack adverse remplacé par des
    placeholders {"letter": "?", "score": 0} (taille préservée, lettres masquées).

    viewer_index : 0 = hôte (invité masqué), 1 = invité (hôte masqué).
    """
    masked = copy.deepcopy(gs_dict)
    opponent_index = 1 - viewer_index
    players = masked.get("players") or []
    if len(players) > opponent_index:
        opp = players[opponent_index]
        rack_size = len(opp.get("rack") or [])
        opp["rack"] = [{"letter": "?", "score": 0}] * rack_size
    return masked


@contextmanager
def _on_engine(engine: GameEngine, game_state):
    """
    Charge la partie dans le moteur le temps d'une action, puis l'en retire.

    La partie de référence est en base (room.game_state). Laissée dans
    engine.active_games, elle serait lisible par les routes solo /game/*,
    qui n'exigent pas d'authentification (S1). Aucun `await` n'a lieu entre
    le chargement et le retrait : aucune autre requête ne peut s'intercaler.
    """
    engine.active_games[game_state.game_id] = game_state
    try:
        yield game_state
    finally:
        engine.forget_game(game_state.game_id)


async def _player_uids(db: AsyncSession, room: MultiplayerGame) -> dict:
    """uid Firebase de l'hôte et de l'invité (lus par les règles RTDB, S2)."""
    ids = [i for i in (room.host_user_id, room.guest_user_id) if i is not None]
    rows = (await db.execute(select(User.id, User.firebase_uid).where(User.id.in_(ids)))).all()
    by_id = {user_id: uid for user_id, uid in rows}
    players = {"host": by_id.get(room.host_user_id)}
    if room.guest_user_id is not None:
        players["guest"] = by_id.get(room.guest_user_id)
    return players


RTDB_STATE_VERSION = 2   # v2 : état encodé en texte JSON (R0)


def _encode_state(gs_dict: dict) -> dict:
    """
    R0 : Firebase supprime les `null` et transforme les tableaux à trous en
    objets. Une chaîne, elle, est stockée telle quelle : l'état arrive chez le
    joueur exactement comme le serveur l'a produit.
    """
    return {
        "state": json.dumps(gs_dict, ensure_ascii=False, separators=(",", ":")),
        "v": RTDB_STATE_VERSION,
    }


def _rtdb_payload(players: dict, gs_dict: Optional[dict] = None) -> dict:
    """Nœud /games/{room_id} complet (voir _sync_rtdb)."""
    payload: dict[str, Any] = {"players": players}
    if gs_dict is not None:
        payload["for_host"]  = _encode_state(_build_masked_state(gs_dict, viewer_index=0))
        payload["for_guest"] = _encode_state(_build_masked_state(gs_dict, viewer_index=1))
    return payload


def _sync_rtdb(room_id: str, players: dict, gs_dict: Optional[dict] = None) -> None:
    """
    Pousse l'état de partie dans Firebase RTDB (fonction synchrone).
    Appelée via await asyncio.to_thread() pour ne pas bloquer l'event loop.

    Structure poussée (un seul set → mise à jour atomique) :
        /games/{room_id}/players   — { host: uid, guest: uid } (règles d'accès)
        /games/{room_id}/for_host  — { state: "<json>", v: 2 }, rack invité masqué
        /games/{room_id}/for_guest — { state: "<json>", v: 2 }, rack hôte masqué

    Sans gs_dict (salle en attente), seul `players` est écrit : l'hôte peut
    déjà écouter son chemin, qui reste vide jusqu'à l'arrivée de l'invité.

    Les erreurs sont loguées mais n'interrompent pas la réponse HTTP.
    """
    payload = _rtdb_payload(players, gs_dict)
    try:
        from firebase_admin import db as rtdb
        rtdb.reference(f"/games/{room_id}").set(payload)
        logger.debug("RTDB sync OK pour room %s", room_id)
    except Exception as exc:
        logger.warning("RTDB sync ignorée (room=%s) : %s", room_id, exc)


def _delete_rtdb(room_id: str) -> None:
    """Supprime le nœud RTDB d'une salle (fonction synchrone, erreurs ignorées)."""
    try:
        from firebase_admin import db as rtdb
        rtdb.reference(f"/games/{room_id}").delete()
    except Exception as exc:
        logger.warning("Suppression RTDB ignorée (room=%s) : %s", room_id, exc)


def _game_state_to_dict(game_state) -> dict:
    return game_state.model_dump()


def _player_index_for_user(game_state_dict: dict, user_id: int, room: MultiplayerGame) -> int:
    if user_id == room.host_user_id:
        return 0
    if user_id == room.guest_user_id:
        return 1
    raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")


def _current_user_id_from_state(game_state_dict: dict, room: MultiplayerGame) -> Optional[int]:
    idx = game_state_dict.get("current_player_index", 0)
    return room.host_user_id if idx == 0 else room.guest_user_id


async def _new_room_code(db: AsyncSession) -> str:
    """Code court libre (31⁶ ≈ 887 millions de combinaisons)."""
    for _ in range(10):
        code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))
        taken = await db.execute(select(MultiplayerGame.id).where(MultiplayerGame.room_id == code))
        if taken.first() is None:
            return code
    raise HTTPException(status_code=503, detail="Impossible de générer un code de salle, réessayez.")


def _normalize_room_id(raw: str) -> str:
    """
    « abc 123 », « ABC-123 » → « ABC123 ». Les anciens identifiants (UUID)
    sont laissés tels quels.
    """
    compact = re.sub(r"[\s\-]", "", raw or "").upper()
    if len(compact) == ROOM_CODE_LENGTH and all(ch in ROOM_CODE_ALPHABET for ch in compact):
        return compact
    return (raw or "").strip()


async def _record_stats(db: AsyncSession, room: MultiplayerGame) -> None:
    """
    C2 : enregistre la partie terminée dans l'historique des deux joueurs et
    met à jour leurs statistiques (classement, profil). Fait par le serveur,
    une seule fois par joueur (game_id d'historique unique).
    """
    if room.status != RoomStatus.FINISHED or not room.game_state:
        return
    players = room.game_state.get("players") or []
    sides = ((room.host_user_id, "host"), (room.guest_user_id, "guest"))
    users = {
        u.id: u for u in (await db.execute(
            select(User).where(User.id.in_([uid for uid, _ in sides if uid is not None]))
        )).scalars()
    }
    for idx, (user_id, side) in enumerate(sides):
        user = users.get(user_id)
        if user is None or len(players) < 2:
            continue
        history_id = f"mp:{room.room_id}:{side}"
        already = await db.execute(select(GameHistory.id).where(GameHistory.game_id == history_id))
        if already.first() is not None:
            continue
        me, opponent = players[idx], players[1 - idx]
        won = room.winner_user_id == user_id
        duration = None
        if room.created_at and room.finished_at:
            duration = int((_as_utc(room.finished_at) - _as_utc(room.created_at)).total_seconds())
        db.add(GameHistory(
            game_id=history_id,
            user_id=user_id,
            user_score=int(me.get("score", 0)),
            ai_name=str(opponent.get("name", ""))[:64],
            ai_score=int(opponent.get("score", 0)),
            ai_difficulty=HISTORY_MODE,
            won=won,
            duration_seconds=max(duration, 0) if duration is not None else None,
            turns_count=0,
        ))
        user.update_stats_after_game(score=int(me.get("score", 0)), won=won)


def _apply_result(room: MultiplayerGame, game_state) -> dict:
    """
    Reporte sur la salle l'état produit par le moteur après un coup, une passe
    ou un échange : état, scores, joueur au trait, et — si la partie est
    finie — statut, date de fin et gagnant (par identifiant, F1).
    """
    gs_dict = _game_state_to_dict(game_state)
    room.game_state      = gs_dict
    room.host_score      = game_state.players[0].score
    room.guest_score     = game_state.players[1].score if len(game_state.players) > 1 else None
    room.current_user_id = _current_user_id_from_state(gs_dict, room)
    room.updated_at      = _utcnow()

    if game_state.status.value == "FINISHED":
        room.status          = RoomStatus.FINISHED
        room.finished_at     = room.updated_at
        room.current_user_id = None
        if game_state.is_draw or game_state.winner_id is None:
            room.winner_user_id = None                  # égalité
        else:
            winner_idx = next(i for i, p in enumerate(game_state.players) if p.id == game_state.winner_id)
            room.winner_user_id = room.host_user_id if winner_idx == 0 else room.guest_user_id
    return gs_dict


def _finish_by_forfeit(room: MultiplayerGame, winner_user_id: int, now: Optional[datetime] = None) -> dict:
    """
    Termine une partie en cours au profit de winner_user_id (abandon, joueur
    inactif). Les scores restent ceux du plateau. Retourne le nouvel état.
    """
    gs_dict = copy.deepcopy(room.game_state)
    winner_idx = 0 if winner_user_id == room.host_user_id else 1
    gs_dict["status"] = "FINISHED"
    gs_dict["winner_name"] = gs_dict["players"][winner_idx]["name"]
    gs_dict["winner_id"] = gs_dict["players"][winner_idx]["id"]
    gs_dict["is_draw"] = False

    now = now or _utcnow()
    room.game_state      = gs_dict
    room.status          = RoomStatus.FINISHED
    room.winner_user_id  = winner_user_id
    room.current_user_id = None
    room.finished_at     = now
    room.updated_at      = now
    return gs_dict


async def _user_rooms(db: AsyncSession, user_id: int, statuses) -> list[MultiplayerGame]:
    """Salles de l'utilisateur (hôte ou invité) aux statuts donnés, la plus récente d'abord."""
    result = await db.execute(
        select(MultiplayerGame)
        .where(
            MultiplayerGame.status.in_([str(s.value) for s in statuses]),
            (MultiplayerGame.host_user_id == user_id) | (MultiplayerGame.guest_user_id == user_id),
        )
        .order_by(MultiplayerGame.created_at.desc(), MultiplayerGame.id.desc())
    )
    return list(result.scalars().all())


def _masked_response(room: MultiplayerGame, viewer_user_id: int) -> RoomStateResponse:
    response = _room_to_response(room)
    if response.game_state:
        viewer_index = 0 if viewer_user_id == room.host_user_id else 1
        response.game_state = _build_masked_state(response.game_state, viewer_index)
    return response


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
    _get_engine(request)  # vérifie que le moteur est prêt

    # Une seule partie à la fois par joueur
    if await _user_rooms(db, current_user.id, [RoomStatus.ACTIVE]):
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà une partie en cours. Terminez-la ou abandonnez-la.",
        )

    # R1 : une salle déjà en attente est renvoyée telle quelle (page actualisée)
    waiting = [r for r in await _user_rooms(db, current_user.id, [RoomStatus.WAITING])
               if r.host_user_id == current_user.id]
    if waiting:
        return CreateRoomResponse(
            room_id=waiting[0].room_id,
            status=RoomStatus.WAITING,
            host_name=current_user.display_name,
        )

    room_id = await _new_room_code(db)  # C1
    room = MultiplayerGame(
        room_id=room_id,
        host_user_id=current_user.id,
        status=RoomStatus.WAITING,
    )
    db.add(room)
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, {"host": current_user.firebase_uid})
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
    room_id = _normalize_room_id(room_id)  # C1
    room = await _get_room_or_404(room_id, db, for_update=True)  # B6

    if room.status != RoomStatus.WAITING:
        raise HTTPException(status_code=409, detail=f"La salle est déjà {room.status}.")
    if room.host_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous êtes déjà l'hôte de cette salle.")
    if await _user_rooms(db, current_user.id, [RoomStatus.ACTIVE]):
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà une partie en cours. Terminez-la ou abandonnez-la.",
        )

    # Rejoindre une partie annule la salle que ce joueur attendait lui-même
    for own in await _user_rooms(db, current_user.id, [RoomStatus.WAITING]):
        if own.host_user_id == current_user.id:
            await db.delete(own)
            await asyncio.to_thread(_delete_rtdb, own.room_id)

    host_result = await db.execute(select(User).where(User.id == room.host_user_id))
    host = host_result.scalar_one()

    game_state = engine.start_new_game(
        player_names=[host.display_name, current_user.display_name],
        difficulty="medium",
    )
    engine.forget_game(game_state.game_id)  # S1 : la référence est en base
    gs_dict = _game_state_to_dict(game_state)

    room.guest_user_id   = current_user.id
    room.status          = RoomStatus.ACTIVE
    room.game_state      = gs_dict
    room.current_user_id = room.host_user_id
    room.host_score      = 0
    room.guest_score     = 0
    room.updated_at      = _utcnow()
    await db.flush()

    players = {"host": host.firebase_uid, "guest": current_user.firebase_uid}
    await asyncio.to_thread(_sync_rtdb, room_id, players, gs_dict)  # B3
    logger.info(
        "Partie démarrée : room %s | %s vs %s",
        room_id, host.display_name, current_user.display_name,
    )

    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=1)
    return response


@router.get(
    "/rooms/current",
    response_model=Optional[RoomStateResponse],
    summary="Salle en attente ou partie en cours de l'utilisateur (reprise)",
)
async def get_current_room(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    R1 : après une actualisation, la page retrouve sa salle ou sa partie.
    Partie en cours en priorité, sinon salle en attente créée par l'utilisateur.
    `null` s'il n'y a rien à reprendre.
    """
    rooms = await _user_rooms(db, current_user.id, [RoomStatus.ACTIVE, RoomStatus.WAITING])
    active  = [r for r in rooms if r.status == RoomStatus.ACTIVE]
    waiting = [r for r in rooms if r.status == RoomStatus.WAITING and r.host_user_id == current_user.id]
    room = (active or waiting or [None])[0]
    return _masked_response(room, current_user.id) if room else None


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
    """Lecture seule — pas de verrou nécessaire."""
    room = await _get_room_or_404(room_id, db)

    if current_user.id not in (room.host_user_id, room.guest_user_id):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")

    return _masked_response(room, current_user.id)


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
    room   = await _get_room_or_404(room_id, db, for_update=True)  # B6

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    placements = [(p["r"], p["c"], p["letter"]) for p in body.placements]
    with _on_engine(engine, gs) as gs_updated:  # S1
        success, message = engine.play_word(gs.game_id, player_id, placements)
    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_dict = _apply_result(room, gs_updated)  # F1
    await _record_stats(db, room)              # C2 (si la partie est finie)
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, await _player_uids(db, room), gs_dict)  # B3

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
    room   = await _get_room_or_404(room_id, db, for_update=True)  # B6

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    with _on_engine(engine, gs) as gs_updated:  # S1
        success, message = engine.pass_turn(gs.game_id, player_id)
    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_dict = _apply_result(room, gs_updated)  # F1
    await _record_stats(db, room)              # C2 (si la partie est finie)
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, await _player_uids(db, room), gs_dict)  # B3

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
    room   = await _get_room_or_404(room_id, db, for_update=True)  # B6

    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ce n'est pas votre tour.")

    from api.models import GameState as GSModel
    gs = GSModel.model_validate(room.game_state)

    player_idx = _player_index_for_user(room.game_state, current_user.id, room)
    player_id  = gs.players[player_idx].id

    with _on_engine(engine, gs) as gs_updated:  # S1
        success, message = engine.swap_tiles(gs.game_id, player_id, body.letters)
    if not success:
        raise HTTPException(status_code=422, detail=message)

    gs_dict = _apply_result(room, gs_updated)  # F1
    await _record_stats(db, room)              # C2 (si la partie est finie)
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, await _player_uids(db, room), gs_dict)  # B3

    response = _room_to_response(room)
    response.game_state = _build_masked_state(gs_dict, viewer_index=player_idx)
    return response


@router.post(
    "/rooms/{room_id}/resign",
    response_model=RoomStateResponse,
    summary="Abandonner la partie (l'adversaire gagne)",
)
async def resign(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(room_id, db, for_update=True)
    if current_user.id not in (room.host_user_id, room.guest_user_id):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")
    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")

    winner = room.guest_user_id if current_user.id == room.host_user_id else room.host_user_id
    gs_dict = _finish_by_forfeit(room, winner)
    await _record_stats(db, room)  # C2
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, await _player_uids(db, room), gs_dict)
    logger.info("Salle %s : abandon de user %d", room_id, current_user.id)
    return _masked_response(room, current_user.id)


@router.post(
    "/rooms/{room_id}/claim-win",
    response_model=RoomStateResponse,
    summary="Réclamer la victoire quand l'adversaire ne joue plus",
)
async def claim_win(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(room_id, db, for_update=True)
    if current_user.id not in (room.host_user_id, room.guest_user_id):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas dans cette partie.")
    if room.status != RoomStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La partie n'est pas en cours.")
    if room.current_user_id == current_user.id:
        raise HTTPException(status_code=409, detail="C'est à vous de jouer.")

    idle = _utcnow() - (_as_utc(room.updated_at) or _utcnow())
    if idle < CLAIM_AFTER:
        remaining = int((CLAIM_AFTER - idle).total_seconds())
        raise HTTPException(
            status_code=409,
            detail=f"Votre adversaire a encore {remaining} s pour jouer.",
        )

    gs_dict = _finish_by_forfeit(room, current_user.id)
    await _record_stats(db, room)  # C2
    await db.flush()
    await asyncio.to_thread(_sync_rtdb, room_id, await _player_uids(db, room), gs_dict)
    logger.info("Salle %s : victoire réclamée par user %d (adversaire inactif)", room_id, current_user.id)
    return _masked_response(room, current_user.id)


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
    room = await _get_room_or_404(room_id, db, for_update=True)  # B6

    if room.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul l'hôte peut annuler la salle.")
    if room.status != RoomStatus.WAITING:
        raise HTTPException(status_code=409, detail="Impossible d'annuler une partie déjà démarrée.")

    await db.delete(room)
    await db.flush()
    await asyncio.to_thread(_delete_rtdb, room_id)
    logger.info("Salle %s annulée par user %d", room_id, current_user.id)