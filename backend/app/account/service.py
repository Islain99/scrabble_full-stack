# app/account/service.py
#
# Suppression du compte et export des données (lot 7 — Loi 25).
#
# Suppression, dans l'ordre :
#   1. parties en cours : abandon (l'adversaire gagne, ses statistiques sont
#      comptées) ; salles en attente : annulées ; toutes les salles du joueur
#      sont ensuite supprimées ;
#   2. messagerie : conversations privées supprimées, groupes transmis au plus
#      ancien membre (ou supprimés s'il n'en reste personne) ; ses messages sont
#      supprimés et retirés du direct, y compris dans le salon universel ;
#   3. la ligne users : tout le reste part en cascade (ON DELETE CASCADE) —
#      historique, amis, groupes, blocages, invitations, signalements, jetons push ;
#   4. base temps réel : présence, liste d'amis (et le lien chez chaque ami),
#      notifications, boîte de réception ;
#   5. compte Firebase Authentication.
# Les étapes 4 et 5 ont lieu après la validation en base (voir router).
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat import realtime as chat_rt
from app.chat.models import Conversation, ConversationKind, ConversationMember, Message, MessageReport
from app.db.models import GameHistory, User
from app.friends.models import FriendGroup, FriendGroupMember, Friendship, FriendshipStatus, UserBlock
from app.multiplayer import router as mp
from app.multiplayer.models import MultiplayerGame, RoomStatus
from app.notifications.models import GameInvitation, InvitationStatus
from app.push.models import PushToken

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Any:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return dt


# ── Base temps réel ───────────────────────────────────────────────

def rtdb_update(values: dict) -> None:
    """Écriture multi-chemins à la racine (None = suppression ; synchrone, erreurs ignorées)."""
    if not values:
        return
    try:
        from firebase_admin import db as rtdb
        rtdb.reference("/").update(values)
    except Exception as exc:
        logger.warning("Suppression de compte : écriture RTDB ignorée : %s", exc)


def delete_auth_user(uid: str) -> bool:
    try:
        from firebase_admin import auth
        auth.delete_user(uid)
        return True
    except Exception as exc:
        logger.warning("Suppression de compte : compte Firebase %s non supprimé : %s", uid, exc)
        return False


# ── Suppression ───────────────────────────────────────────────────

async def purge_user(db: AsyncSession, user: User) -> dict:
    """
    Supprime le joueur et ce qui en dépend dans PostgreSQL. Retourne ce que
    l'appelant doit faire après la validation : {"rtdb": {...}, "games": [...]}.
    """
    me, uid = user.id, user.firebase_uid
    rtdb: dict[str, Any] = {
        f"presence/{uid}": None,
        f"friends/{uid}": None,
        f"notifications/{uid}": None,
        f"inbox/{uid}": None,
    }
    game_syncs: list[tuple[str, dict, dict]] = []

    # 1. Parties
    rooms = (await db.execute(select(MultiplayerGame).where(or_(
        MultiplayerGame.host_user_id == me, MultiplayerGame.guest_user_id == me,
    )).with_for_update())).scalars().all()
    for room in rooms:
        if room.status == RoomStatus.ACTIVE and room.guest_user_id is not None:
            winner = room.guest_user_id if me == room.host_user_id else room.host_user_id
            gs_dict = mp._finish_by_forfeit(room, winner)
            await mp._record_stats(db, room)                     # l'adversaire gagne
            players = await mp._player_uids(db, room)
            game_syncs.append((room.room_id, players, gs_dict))   # il voit la fin de partie
        else:
            rtdb[f"games/{room.room_id}"] = None
            rtdb[f"lobby/{room.room_id}"] = None
        for inv_uid, key in await _pending_room_invites(db, room.room_id):
            rtdb[f"notifications/{inv_uid}/{key}"] = None
    await db.flush()
    for room in rooms:
        await db.delete(room)

    # Notifications déposées chez les autres : invitations envoyées, demandes d'ami
    for inv, inv_uid in (await db.execute(
        select(GameInvitation, User.firebase_uid).join(User, User.id == GameInvitation.invitee_id)
        .where(GameInvitation.inviter_id == me, GameInvitation.status == InvitationStatus.PENDING)
    )).all():
        rtdb[f"notifications/{inv_uid}/inv-{inv.id}"] = None
    for row, other_uid in (await db.execute(
        select(Friendship, User.firebase_uid).join(User, User.id == Friendship.addressee_id)
        .where(Friendship.requester_id == me, Friendship.status == FriendshipStatus.PENDING)
    )).all():
        rtdb[f"notifications/{other_uid}/fr-{row.id}"] = None

    # Liens d'amitié chez chaque ami (lecture de la présence)
    friend_rows = (await db.execute(
        select(User.firebase_uid).join(Friendship, or_(
            (Friendship.requester_id == me) & (Friendship.addressee_id == User.id),
            (Friendship.addressee_id == me) & (Friendship.requester_id == User.id),
        )).where(Friendship.status == FriendshipStatus.ACCEPTED)
    )).scalars().all()
    for friend_uid in friend_rows:
        rtdb[f"friends/{friend_uid}/{uid}"] = None

    # 2. Messagerie
    authored = (await db.execute(
        select(Message.conversation_id, Message.id).where(Message.author_id == me)
    )).all()
    by_conv: dict[int, set[int]] = {}
    for cid, mid in authored:
        by_conv.setdefault(cid, set()).add(mid)
    for cid, mids in by_conv.items():
        conv = await db.get(Conversation, cid)
        if conv is None:
            continue
        live = (await db.execute(
            select(Message.id).where(Message.conversation_id == cid)
            .order_by(Message.id.desc()).limit(chat_rt.LIVE_MESSAGES)
        )).scalars().all()
        for mid in set(live) & mids:
            rtdb[f"chat/{chat_rt.rtdb_key(conv)}/messages/{mid}"] = None

    memberships = (await db.execute(
        select(ConversationMember, Conversation)
        .join(Conversation, Conversation.id == ConversationMember.conversation_id)
        .where(ConversationMember.user_id == me)
    )).all()
    touched_groups: list[Conversation] = []
    for member, conv in memberships:
        others = (await db.execute(
            select(ConversationMember, User.firebase_uid)
            .join(User, User.id == ConversationMember.user_id)
            .where(ConversationMember.conversation_id == conv.id, ConversationMember.user_id != me)
            .order_by(ConversationMember.joined_at, ConversationMember.user_id)
        )).all()
        if conv.kind == ConversationKind.GROUP and others:
            if member.role == "owner":
                others[0][0].role = "owner"
            touched_groups.append(conv)
            rtdb[f"chat/{conv.id}/members/{uid}"] = None
        else:
            # Privée, de partie, ou groupe vide : la conversation disparaît
            for _, other_uid in others:
                rtdb[f"inbox/{other_uid}/{conv.id}"] = None
            rtdb[f"chat/{chat_rt.rtdb_key(conv)}"] = None
            await db.execute(delete(Message).where(Message.conversation_id == conv.id))
            await db.delete(conv)
    await db.execute(delete(Message).where(Message.author_id == me))
    await db.flush()

    # 3. Le compte (le reste part en cascade)
    await db.execute(delete(User).where(User.id == me))
    await db.flush()

    return {"rtdb": rtdb, "games": game_syncs, "groups": [c.id for c in touched_groups], "uid": uid}


async def _pending_room_invites(db: AsyncSession, room_id: str) -> list[tuple[str, str]]:
    rows = (await db.execute(
        select(GameInvitation.id, User.firebase_uid).join(User, User.id == GameInvitation.invitee_id)
        .where(GameInvitation.room_id == room_id, GameInvitation.status == InvitationStatus.PENDING)
    )).all()
    return [(inv_uid, f"inv-{inv_id}") for inv_id, inv_uid in rows]


async def after_commit(plan: dict, refresh_group) -> None:
    """Base temps réel et Firebase Auth, une fois la suppression validée."""
    for room_id, players, gs_dict in plan["games"]:
        await asyncio.to_thread(mp._sync_rtdb, room_id, players, gs_dict)
    await asyncio.to_thread(rtdb_update, plan["rtdb"])
    for conv_id in plan["groups"]:
        try:
            await refresh_group(conv_id)
        except Exception as exc:
            logger.warning("Suppression de compte : groupe %s non resynchronisé : %s", conv_id, exc)
    await asyncio.to_thread(delete_auth_user, plan["uid"])


# ── Export ────────────────────────────────────────────────────────

PROFILE_FIELDS = (
    "id", "email", "display_name", "first_name", "last_name", "age", "country", "bio",
    "avatar_url", "auth_provider", "is_verified", "friend_code", "created_at", "last_login_at",
)
STAT_FIELDS = (
    "games_played", "games_won", "total_score", "best_score", "average_score", "best_word", "best_word_score",
    "mp_rating", "mp_peak_rating", "mp_games", "mp_wins", "mp_draws", "mp_total_score", "mp_best_score",
)


async def export_user(db: AsyncSession, user: User) -> dict:
    """Toutes les données personnelles du joueur, lisibles (JSON)."""
    me = user.id
    names = {}

    async def name_of(ids):
        missing = [i for i in ids if i is not None and i not in names]
        if missing:
            names.update(dict((await db.execute(
                select(User.id, User.display_name).where(User.id.in_(missing)))).all()))

    histories = (await db.execute(select(GameHistory).where(GameHistory.user_id == me)
                                  .order_by(GameHistory.created_at))).scalars().all()
    friendships = (await db.execute(select(Friendship).where(or_(
        Friendship.requester_id == me, Friendship.addressee_id == me)))).scalars().all()
    groups = (await db.execute(select(FriendGroup).where(FriendGroup.owner_id == me))).scalars().all()
    group_members = (await db.execute(select(FriendGroupMember).where(
        FriendGroupMember.group_id.in_([g.id for g in groups] or [-1])))).scalars().all()
    blocks = (await db.execute(select(UserBlock).where(UserBlock.blocker_id == me))).scalars().all()
    invitations = (await db.execute(select(GameInvitation).where(or_(
        GameInvitation.inviter_id == me, GameInvitation.invitee_id == me)))).scalars().all()
    memberships = (await db.execute(
        select(ConversationMember, Conversation)
        .join(Conversation, Conversation.id == ConversationMember.conversation_id)
        .where(ConversationMember.user_id == me))).all()
    messages = (await db.execute(
        select(Message, Conversation.kind).join(Conversation, Conversation.id == Message.conversation_id)
        .where(Message.author_id == me).order_by(Message.id))).all()
    reports = (await db.execute(select(MessageReport).where(MessageReport.reporter_id == me))).scalars().all()
    devices = (await db.execute(select(PushToken).where(PushToken.user_id == me))).scalars().all()

    await name_of({f.other(me) for f in friendships} | {b.blocked_id for b in blocks}
                  | {i.inviter_id for i in invitations} | {i.invitee_id for i in invitations}
                  | {m.friend_id for m in group_members})

    def friend_status(f: Friendship) -> str:
        if f.status == FriendshipStatus.ACCEPTED:
            return "friend"
        if f.requester_id == me:
            return "request_sent"
        return "request_received" if f.status == FriendshipStatus.PENDING else "declined_by_me"

    return {
        "export": {
            "generated_at": _iso(_utcnow()),
            "format": "scrabble-export/1",
            "note": "Données personnelles associées à votre compte. "
                    "Personal data associated with your account.",
        },
        "profile": {k: _iso(getattr(user, k, None)) for k in PROFILE_FIELDS},
        "statistics": {k: getattr(user, k, None) for k in STAT_FIELDS},
        "preferences": user.get_preferences(),
        "game_history": [{
            "game_id": h.game_id, "mode": "multiplayer" if h.ai_difficulty == "multiplayer" else "solo",
            "opponent": h.ai_name, "difficulty": None if h.ai_difficulty == "multiplayer" else h.ai_difficulty,
            "my_score": h.user_score, "opponent_score": h.ai_score, "won": h.won,
            "rating_delta": h.rating_delta, "duration_seconds": h.duration_seconds,
            "best_word": h.best_word, "best_word_score": h.best_word_score, "played_at": _iso(h.created_at),
        } for h in histories],
        "friends": [{
            "user": names.get(f.other(me), "?"), "status": friend_status(f),
            "since": _iso(f.responded_at or f.created_at),
        } for f in friendships],
        "friend_groups": [{
            "name": g.name, "color": g.color,
            "members": [names.get(m.friend_id, "?") for m in group_members if m.group_id == g.id],
        } for g in groups],
        "blocked_players": [names.get(b.blocked_id, "?") for b in blocks],
        "game_invitations": [{
            "direction": "sent" if i.inviter_id == me else "received",
            "with": names.get(i.invitee_id if i.inviter_id == me else i.inviter_id, "?"),
            "room": i.room_id, "status": i.status, "at": _iso(i.created_at),
        } for i in invitations],
        "conversations": [{
            "id": conv.id, "kind": conv.kind, "name": conv.name, "role": m.role,
            "joined_at": _iso(m.joined_at), "muted": bool(m.muted),
        } for m, conv in memberships],
        "messages_written": [{
            "conversation_id": msg.conversation_id, "conversation_kind": kind,
            "body": msg.body, "deleted": msg.deleted_at is not None, "at": _iso(msg.created_at),
        } for msg, kind in messages],
        "reports_made": [{
            "message_id": r.message_id, "reason": r.reason, "at": _iso(r.created_at),
            "resolved": r.resolved_at is not None,
        } for r in reports],
        "devices": [{
            "platform": d.platform, "language": d.locale,
            "registered_at": _iso(d.created_at), "last_seen_at": _iso(d.last_seen_at),
        } for d in devices],
    }
