# app/chat/router.py
#
# Messagerie (lot 6) : conversations privées (entre amis), de groupe, salon
# universel, chat de partie ; modération par un administrateur.
#
#   GET    /chat/conversations                     mes conversations (+ salon universel)
#   POST   /chat/conversations/private             ouvrir la conversation avec un ami
#   POST   /chat/conversations/group               créer un groupe (amis du créateur)
#   PATCH  /chat/conversations/{id}                renommer un groupe (propriétaire)
#   POST   /chat/conversations/{id}/members        ajouter des amis au groupe (propriétaire)
#   DELETE /chat/conversations/{id}/members/{uid}  retirer un membre, ou quitter
#   POST   /chat/conversations/{id}/mute           couper / rétablir les non-lus
#   GET    /chat/rooms/{room_id}                   chat de la partie (les deux joueurs)
#   GET    /chat/conversations/{id}/messages       historique, par pages (?before=)
#   POST   /chat/conversations/{id}/messages       envoyer
#   POST   /chat/conversations/{id}/read           marquer comme lu
#   DELETE /chat/messages/{id}                     supprimer (auteur ou administrateur)
#   POST   /chat/messages/{id}/report              signaler
#   Administration : /chat/admin/reports, /chat/admin/reports/{id}/resolve,
#                    /chat/admin/users/{id}/mute, /chat/admin/global/slow-mode
#
# Le serveur vérifie tout (appartenance, amitié, blocages, sourdine, cadence,
# liens, filtre) puis enregistre dans PostgreSQL et diffuse dans la base temps
# réel (app/chat/realtime.py). Les messages ne sont pas chiffrés de bout en
# bout : le serveur les lit pour les modérer.
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.chat import realtime
from app.chat.models import Conversation, ConversationKind, ConversationMember, Message, MessageReport
from app.chat.moderation import clean_body, contains_link, mask_profanity
from app.db.database import get_db
from app.db.models import User
from app.friends.models import UserBlock
from app.friends.router import are_friends, is_blocked_between
from app.multiplayer.models import MultiplayerGame
from app.push import service as push_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Messagerie"])

MAX_BODY         = 500
MAX_GROUP        = 20          # membres, créateur compris
MIN_INTERVAL     = timedelta(seconds=2)
MAX_PER_MINUTE   = 20
LINK_MIN_AGE     = timedelta(hours=24)
PAGE_SIZE        = 50
GLOBAL_KEY       = "global"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _ms(dt: Optional[datetime]) -> Optional[int]:
    dt = _as_utc(dt)
    return int(dt.timestamp() * 1000) if dt else None


# ── Schémas ───────────────────────────────────────────────────────

class MemberOut(BaseModel):
    user_id:      int
    display_name: str
    role:         str


class ConversationOut(BaseModel):
    id:              int
    key:             str                  # chemin temps réel : /chat/{key}
    kind:            str
    title:           Optional[str] = None # nom du groupe, pseudo de l'ami, « Partie ABC234 »
    name:            Optional[str] = None
    room_id:         Optional[str] = None
    members:         list[MemberOut] = []
    my_role:         Optional[str] = None
    unread:          int = 0
    muted:           bool = False
    last_preview:    Optional[str] = None
    last_message_at: Optional[datetime] = None
    slow_mode_s:     int = 0


class MessageOut(BaseModel):
    id:              int
    conversation_id: int
    author_id:       Optional[int]
    author_name:     str
    body:            str
    deleted:         bool = False
    created_at:      int                  # ms depuis l'époque (comme le temps réel)


class MessagesPage(BaseModel):
    messages: list[MessageOut]            # du plus ancien au plus récent
    has_more: bool


class BodyIn(BaseModel):
    body: str


class PrivateIn(BaseModel):
    user_id: int


def _clean_group_name(v: str) -> str:
    cleaned = " ".join("".join(ch for ch in (v or "") if ch.isprintable()).split())
    if not cleaned:
        raise ValueError("Le nom du groupe est obligatoire.")
    if len(cleaned) > 40:
        raise ValueError("Le nom du groupe compte 40 caractères au plus.")
    return cleaned


class GroupIn(BaseModel):
    name:       str
    member_ids: list[int]

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_group_name(v)


class RenameIn(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_group_name(v)


class MembersIn(BaseModel):
    user_ids: list[int]


class MuteIn(BaseModel):
    muted: bool


class ReadIn(BaseModel):
    message_id: Optional[int] = None


class ReportIn(BaseModel):
    reason: Optional[str] = None

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip()[:200] or None


class ReportOut(BaseModel):
    id:            int
    message:       MessageOut
    conversation_kind: str
    reporter_name: str
    reason:        Optional[str]
    reports_count: int
    created_at:    datetime


class AdminMuteIn(BaseModel):
    minutes: int        # 0 = lever la sourdine

    @field_validator("minutes")
    @classmethod
    def _minutes(cls, v: int) -> int:
        if v < 0 or v > 60 * 24 * 30:
            raise ValueError("Durée invalide (0 à 30 jours).")
        return v


class SlowModeIn(BaseModel):
    seconds: int

    @field_validator("seconds")
    @classmethod
    def _seconds(cls, v: int) -> int:
        if v < 0 or v > 600:
            raise ValueError("Entre 0 et 600 secondes.")
        return v


# ── Helpers ───────────────────────────────────────────────────────

def _require_admin(user: User) -> None:
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")


async def get_global(db: AsyncSession) -> Conversation:
    """Le salon universel (créé par la migration ; recréé au besoin)."""
    conv = (await db.execute(select(Conversation).where(Conversation.unique_key == GLOBAL_KEY))).scalar_one_or_none()
    if conv is None:
        conv = Conversation(kind=ConversationKind.GLOBAL, name="Universel", unique_key=GLOBAL_KEY, created_at=_utcnow())
        db.add(conv)
        await db.flush()
    return conv


async def _conversation(db: AsyncSession, conversation_id: int) -> Conversation:
    conv = await db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")
    return conv


async def _membership(db: AsyncSession, conv: Conversation, user_id: int) -> Optional[ConversationMember]:
    return await db.get(ConversationMember, (conv.id, user_id))


async def _readable(db: AsyncSession, conv: Conversation, user: User) -> Optional[ConversationMember]:
    """Membre (ou None pour le salon universel) ; 404 si la conversation n'est pas la sienne."""
    if conv.kind == ConversationKind.GLOBAL:
        return None
    member = await _membership(db, conv, user.id)
    if member is None:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")
    return member


async def _members(db: AsyncSession, conv: Conversation) -> list[tuple[ConversationMember, User]]:
    return list((await db.execute(
        select(ConversationMember, User).join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id == conv.id)
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    )).all())


def _title(conv: Conversation, members: list[tuple[ConversationMember, User]], viewer_id: int) -> Optional[str]:
    if conv.kind == ConversationKind.PRIVATE:
        other = next((u for _, u in members if u.id != viewer_id), None)
        return other.display_name if other else None
    if conv.kind == ConversationKind.GAME:
        return f"Partie {conv.room_id}"
    return conv.name


async def _sync_members(db: AsyncSession, conv: Conversation) -> None:
    if conv.kind == ConversationKind.GLOBAL:
        return
    uids = [u.firebase_uid for _, u in await _members(db, conv)]
    await asyncio.to_thread(realtime.set_members, realtime.rtdb_key(conv), uids)


def _message_out(msg: Message, author_name: str) -> MessageOut:
    deleted = msg.deleted_at is not None
    return MessageOut(
        id=msg.id, conversation_id=msg.conversation_id, author_id=msg.author_id,
        author_name=author_name, body="" if deleted else msg.body, deleted=deleted,
        created_at=_ms(msg.created_at) or 0,
    )


async def _last_message(db: AsyncSession, conv_id: int) -> Optional[tuple[Message, str]]:
    row = (await db.execute(
        select(Message, User.display_name).outerjoin(User, User.id == Message.author_id)
        .where(Message.conversation_id == conv_id, Message.deleted_at.is_(None))
        .order_by(Message.id.desc()).limit(1)
    )).first()
    return (row[0], row[1] or "?") if row else None


async def _unread(db: AsyncSession, conv_id: int, member: ConversationMember) -> int:
    return (await db.execute(select(func.count()).select_from(Message).where(
        Message.conversation_id == conv_id, Message.id > member.last_read_id,
        Message.deleted_at.is_(None), Message.author_id != member.user_id,
    ))).scalar_one()


async def _unread_by_member(db: AsyncSession, conv_id: int) -> dict[int, int]:
    """Non-lus de tous les membres d'une conversation, en une requête."""
    rows = (await db.execute(
        select(ConversationMember.user_id, func.count(Message.id))
        .select_from(ConversationMember)
        .outerjoin(Message, and_(
            Message.conversation_id == ConversationMember.conversation_id,
            Message.id > ConversationMember.last_read_id,
            Message.deleted_at.is_(None),
            Message.author_id != ConversationMember.user_id,
        ))
        .where(ConversationMember.conversation_id == conv_id)
        .group_by(ConversationMember.user_id)
    )).all()
    return {uid: n for uid, n in rows}


async def _unread_for_user(db: AsyncSession, user_id: int, conv_ids: list[int]) -> dict[int, int]:
    """Non-lus d'un joueur dans plusieurs conversations, en une requête."""
    if not conv_ids:
        return {}
    rows = (await db.execute(
        select(ConversationMember.conversation_id, func.count(Message.id))
        .select_from(ConversationMember)
        .outerjoin(Message, and_(
            Message.conversation_id == ConversationMember.conversation_id,
            Message.id > ConversationMember.last_read_id,
            Message.deleted_at.is_(None),
            Message.author_id != ConversationMember.user_id,
        ))
        .where(ConversationMember.user_id == user_id, ConversationMember.conversation_id.in_(conv_ids))
        .group_by(ConversationMember.conversation_id)
    )).all()
    return {cid: n for cid, n in rows}


async def _last_messages(db: AsyncSession, conv_ids: list[int]) -> dict[int, tuple[Message, str]]:
    """Dernier message visible de chaque conversation, en deux requêtes."""
    if not conv_ids:
        return {}
    last_ids = (await db.execute(
        select(func.max(Message.id)).where(Message.conversation_id.in_(conv_ids), Message.deleted_at.is_(None))
        .group_by(Message.conversation_id)
    )).scalars().all()
    if not last_ids:
        return {}
    rows = (await db.execute(
        select(Message, User.display_name).outerjoin(User, User.id == Message.author_id)
        .where(Message.id.in_(last_ids))
    )).all()
    return {m.conversation_id: (m, name or "?") for m, name in rows}


def _preview(author: str, body: str) -> str:
    text = " ".join(body.split())
    return f"{author} : {text[:80]}{'…' if len(text) > 80 else ''}"


async def _refresh_inboxes(db: AsyncSession, conv: Conversation) -> None:
    """Met à jour /inbox/{uid}/{conversation} de chaque membre (aperçu, non-lus).

    Quatre requêtes et une seule écriture temps réel, quelle que soit la taille du groupe.
    """
    if conv.kind == ConversationKind.GLOBAL:
        return
    members = await _members(db, conv)
    last = await _last_message(db, conv.id)
    unread = await _unread_by_member(db, conv.id)
    preview = _preview(last[1], last[0].body) if last else None
    entries = {
        user.firebase_uid: {
            "kind": conv.kind,
            "title": _title(conv, members, user.id),
            "preview": preview,
            "last_at": _ms(conv.last_message_at),
            "unread": unread.get(user.id, 0),
            "muted": bool(member.muted),
        }
        for member, user in members
    }
    await asyncio.to_thread(realtime.set_inboxes, conv.id, entries)


async def _conversation_out(db: AsyncSession, conv: Conversation, viewer: User) -> ConversationOut:
    members = await _members(db, conv)
    me = next((m for m, u in members if u.id == viewer.id), None)
    last = await _last_message(db, conv.id)
    return ConversationOut(
        id=conv.id, key=realtime.rtdb_key(conv), kind=conv.kind,
        title=_title(conv, members, viewer.id) if conv.kind != ConversationKind.GLOBAL else conv.name,
        name=conv.name, room_id=conv.room_id,
        members=[MemberOut(user_id=u.id, display_name=u.display_name, role=m.role) for m, u in members],
        my_role=me.role if me else None,
        unread=await _unread(db, conv.id, me) if me else 0,
        muted=bool(me.muted) if me else False,
        last_preview=_preview(last[1], last[0].body) if last else None,
        last_message_at=_as_utc(conv.last_message_at),
        slow_mode_s=conv.slow_mode_s or 0,
    )


async def _conversations_out(db: AsyncSession, convs: list[Conversation], viewer: User) -> list[ConversationOut]:
    """Comme _conversation_out pour une liste, en un nombre fixe de requêtes."""
    ids = [c.id for c in convs]
    if not ids:
        return []
    members: dict[int, list[tuple[ConversationMember, User]]] = {}
    for m, u in (await db.execute(
        select(ConversationMember, User).join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id.in_(ids))
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    )).all():
        members.setdefault(m.conversation_id, []).append((m, u))
    unread = await _unread_for_user(db, viewer.id, ids)
    lasts = await _last_messages(db, ids)
    out = []
    for conv in convs:
        mem = members.get(conv.id, [])
        me = next((m for m, u in mem if u.id == viewer.id), None)
        last = lasts.get(conv.id)
        out.append(ConversationOut(
            id=conv.id, key=realtime.rtdb_key(conv), kind=conv.kind,
            title=_title(conv, mem, viewer.id), name=conv.name, room_id=conv.room_id,
            members=[MemberOut(user_id=u.id, display_name=u.display_name, role=m.role) for m, u in mem],
            my_role=me.role if me else None,
            unread=unread.get(conv.id, 0) if me else 0,
            muted=bool(me.muted) if me else False,
            last_preview=_preview(last[1], last[0].body) if last else None,
            last_message_at=_as_utc(conv.last_message_at),
            slow_mode_s=conv.slow_mode_s or 0,
        ))
    return out


async def _add_member(db: AsyncSession, conv: Conversation, user_id: int, role: str = "member") -> None:
    if await _membership(db, conv, user_id) is None:
        db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role=role, joined_at=_utcnow()))


async def _blocked_by_me(db: AsyncSession, me: int) -> set[int]:
    return set((await db.execute(select(UserBlock.blocked_id).where(UserBlock.blocker_id == me))).scalars().all())


# ── Conversations ─────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationOut], summary="Mes conversations")
async def list_conversations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    glob = await get_global(db)
    convs = (await db.execute(
        select(Conversation).join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == current_user.id)
        .order_by(func.coalesce(Conversation.last_message_at, Conversation.created_at).desc())
    )).scalars().all()
    return [await _conversation_out(db, glob, current_user)] + await _conversations_out(db, list(convs), current_user)


@router.post("/conversations/private", response_model=ConversationOut, summary="Conversation privée avec un ami")
async def open_private(body: PrivateIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await are_friends(db, current_user.id, body.user_id) or await is_blocked_between(db, current_user.id, body.user_id):
        raise HTTPException(status_code=403, detail="Les messages privés sont réservés à vos amis.")
    low, high = sorted((current_user.id, body.user_id))
    key = f"private:{low}:{high}"
    conv = (await db.execute(select(Conversation).where(Conversation.unique_key == key))).scalar_one_or_none()
    if conv is None:
        conv = Conversation(kind=ConversationKind.PRIVATE, unique_key=key, creator_id=current_user.id, created_at=_utcnow())
        db.add(conv)
        await db.flush()
        await _add_member(db, conv, low)
        await _add_member(db, conv, high)
        await db.flush()
        await _sync_members(db, conv)
    return await _conversation_out(db, conv, current_user)


@router.post("/conversations/group", response_model=ConversationOut, status_code=status.HTTP_201_CREATED,
             summary="Créer une conversation de groupe")
async def create_group(body: GroupIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    others = sorted(set(body.member_ids) - {current_user.id})
    if len(others) < 2:
        raise HTTPException(status_code=422, detail="Un groupe réunit au moins 3 personnes.")
    if len(others) + 1 > MAX_GROUP:
        raise HTTPException(status_code=422, detail=f"{MAX_GROUP} membres au plus.")
    for uid in others:
        if not await are_friends(db, current_user.id, uid):
            raise HTTPException(status_code=403, detail="Vous ne pouvez ajouter que vos amis.")
    conv = Conversation(kind=ConversationKind.GROUP, name=body.name, creator_id=current_user.id, created_at=_utcnow())
    db.add(conv)
    await db.flush()
    await _add_member(db, conv, current_user.id, role="owner")
    for uid in others:
        await _add_member(db, conv, uid)
    await db.flush()
    await _sync_members(db, conv)
    await _refresh_inboxes(db, conv)
    return await _conversation_out(db, conv, current_user)


async def _owned_group(db: AsyncSession, conversation_id: int, user: User) -> Conversation:
    conv = await _conversation(db, conversation_id)
    member = await _readable(db, conv, user)
    if conv.kind != ConversationKind.GROUP:
        raise HTTPException(status_code=409, detail="Seuls les groupes se gèrent ainsi.")
    if member is None or member.role != "owner":
        raise HTTPException(status_code=403, detail="Seul le créateur du groupe peut le gérer.")
    return conv


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut, summary="Renommer un groupe")
async def rename_group(conversation_id: int, body: RenameIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _owned_group(db, conversation_id, current_user)
    conv.name = body.name
    await db.flush()
    await _refresh_inboxes(db, conv)
    return await _conversation_out(db, conv, current_user)


@router.post("/conversations/{conversation_id}/members", response_model=ConversationOut, summary="Ajouter des amis au groupe")
async def add_members(conversation_id: int, body: MembersIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _owned_group(db, conversation_id, current_user)
    current = {u.id for _, u in await _members(db, conv)}
    new = sorted(set(body.user_ids) - current)
    if len(current) + len(new) > MAX_GROUP:
        raise HTTPException(status_code=422, detail=f"{MAX_GROUP} membres au plus.")
    for uid in new:
        if not await are_friends(db, current_user.id, uid):
            raise HTTPException(status_code=403, detail="Vous ne pouvez ajouter que vos amis.")
        await _add_member(db, conv, uid)
    await db.flush()
    await _sync_members(db, conv)
    await _refresh_inboxes(db, conv)
    return await _conversation_out(db, conv, current_user)


@router.delete("/conversations/{conversation_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Retirer un membre du groupe, ou le quitter")
async def remove_member(conversation_id: int, user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _conversation(db, conversation_id)
    me = await _readable(db, conv, current_user)
    if conv.kind != ConversationKind.GROUP:
        raise HTTPException(status_code=409, detail="On ne quitte qu'un groupe.")
    if user_id != current_user.id and (me is None or me.role != "owner"):
        raise HTTPException(status_code=403, detail="Seul le créateur du groupe peut retirer un membre.")
    target = await _membership(db, conv, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Ce joueur n'est pas dans le groupe.")
    uid = (await db.execute(select(User.firebase_uid).where(User.id == user_id))).scalar_one_or_none()
    was_owner = target.role == "owner"
    await db.delete(target)
    await db.flush()
    remaining = await _members(db, conv)
    if was_owner and remaining:
        remaining[0][0].role = "owner"          # le plus ancien membre reprend le groupe
        await db.flush()
    if uid:
        await asyncio.to_thread(realtime.set_inbox, uid, conv.id, None)
    if not remaining:
        await db.delete(conv)
        await db.flush()
        await asyncio.to_thread(realtime.drop_conversation, realtime.rtdb_key(conv))
        return
    await _sync_members(db, conv)
    await _refresh_inboxes(db, conv)


@router.post("/conversations/{conversation_id}/mute", response_model=ConversationOut, summary="Couper ou rétablir les non-lus")
async def mute_conversation(conversation_id: int, body: MuteIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _conversation(db, conversation_id)
    member = await _readable(db, conv, current_user)
    if member is None:
        raise HTTPException(status_code=409, detail="Le salon universel ne compte pas de non-lus.")
    member.muted = body.muted
    await db.flush()
    await _refresh_inboxes(db, conv)
    return await _conversation_out(db, conv, current_user)


@router.get("/rooms/{room_id}", response_model=ConversationOut, summary="Chat de la partie")
async def game_conversation(room_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.multiplayer.router import _normalize_room_id
    room_id = _normalize_room_id(room_id)
    room = (await db.execute(select(MultiplayerGame).where(MultiplayerGame.room_id == room_id))).scalar_one_or_none()
    if room is None or current_user.id not in (room.host_user_id, room.guest_user_id) or room.guest_user_id is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    key = f"game:{room_id}"
    conv = (await db.execute(select(Conversation).where(Conversation.unique_key == key))).scalar_one_or_none()
    if conv is None:
        conv = Conversation(kind=ConversationKind.GAME, unique_key=key, room_id=room_id, created_at=_utcnow())
        db.add(conv)
        await db.flush()
        await _add_member(db, conv, room.host_user_id)
        await _add_member(db, conv, room.guest_user_id)
        await db.flush()
        await _sync_members(db, conv)
    return await _conversation_out(db, conv, current_user)


# ── Messages ──────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages", response_model=MessagesPage, summary="Historique")
async def list_messages(
    conversation_id: int,
    before: Optional[int] = Query(None, description="Messages d'identifiant inférieur (page précédente)"),
    limit: int = Query(PAGE_SIZE, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _conversation(db, conversation_id)
    await _readable(db, conv, current_user)
    hidden = await _blocked_by_me(db, current_user.id)
    query = (select(Message, User.display_name).outerjoin(User, User.id == Message.author_id)
             .where(Message.conversation_id == conv.id))
    if before is not None:
        query = query.where(Message.id < before)
    if hidden:
        query = query.where(or_(Message.author_id.is_(None), Message.author_id.not_in(hidden)))
    rows = (await db.execute(query.order_by(Message.id.desc()).limit(limit + 1))).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return MessagesPage(
        messages=[_message_out(m, name or "?") for m, name in reversed(rows)],
        has_more=has_more,
    )


async def _check_can_send(db: AsyncSession, conv: Conversation, user: User, body: str) -> None:
    now = _utcnow()
    # Relu en base : la sourdine a pu être posée depuis le chargement du joueur
    muted_until = _as_utc((await db.execute(select(User.chat_muted_until).where(User.id == user.id))).scalar_one_or_none())
    if muted_until and muted_until > now:
        minutes = max(1, int((muted_until - now).total_seconds() // 60) + 1)
        raise HTTPException(status_code=403, detail=f"Un administrateur vous a rendu muet : encore {minutes} min.")

    member = await _readable(db, conv, user)
    if conv.kind == ConversationKind.PRIVATE:
        others = [u.id for _, u in await _members(db, conv) if u.id != user.id]
        for other in others:
            if not await are_friends(db, user.id, other) or await is_blocked_between(db, user.id, other):
                raise HTTPException(status_code=403, detail="Les messages privés sont réservés à vos amis.")
    elif member is None and conv.kind != ConversationKind.GLOBAL:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")

    # Cadence : 2 s entre deux messages, 20 par minute, mode lent du salon universel
    last_at = (await db.execute(select(func.max(Message.created_at)).where(Message.author_id == user.id))).scalar_one()
    last_at = _as_utc(last_at)
    if last_at and now - last_at < MIN_INTERVAL:
        raise HTTPException(status_code=429, detail="Doucement : un message toutes les 2 secondes.")
    per_minute = (await db.execute(select(func.count()).select_from(Message).where(
        Message.author_id == user.id, Message.created_at >= now - timedelta(minutes=1)))).scalar_one()
    if per_minute >= MAX_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Trop de messages en une minute. Patientez un peu.")
    if conv.kind == ConversationKind.GLOBAL and conv.slow_mode_s:
        last_here = _as_utc((await db.execute(select(func.max(Message.created_at)).where(
            Message.author_id == user.id, Message.conversation_id == conv.id))).scalar_one())
        if last_here and now - last_here < timedelta(seconds=conv.slow_mode_s):
            wait = int(conv.slow_mode_s - (now - last_here).total_seconds()) + 1
            raise HTTPException(status_code=429, detail=f"Mode lent : encore {wait} s avant votre prochain message.")

    created = _as_utc(getattr(user, "created_at", None))
    if contains_link(body) and created and now - created < LINK_MIN_AGE:
        raise HTTPException(status_code=422, detail="Les liens sont réservés aux comptes de plus de 24 h.")


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut,
             status_code=status.HTTP_201_CREATED, summary="Envoyer un message")
async def send_message(conversation_id: int, payload: BodyIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _conversation(db, conversation_id)
    body = clean_body(payload.body)
    if not body:
        raise HTTPException(status_code=422, detail="Message vide.")
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=422, detail=f"{MAX_BODY} caractères au plus.")
    await _check_can_send(db, conv, current_user, body)

    msg = Message(conversation_id=conv.id, author_id=current_user.id, body=mask_profanity(body), created_at=_utcnow())
    db.add(msg)
    conv.last_message_at = msg.created_at
    await db.flush()
    # L'auteur a lu son propre message
    member = await _membership(db, conv, current_user.id)
    if member is not None:
        member.last_read_id = msg.id
        await db.flush()

    out = _message_out(msg, current_user.display_name)
    drop_id = (await db.execute(
        select(Message.id).where(Message.conversation_id == conv.id)
        .order_by(Message.id.desc()).offset(realtime.LIVE_MESSAGES).limit(1)
    )).scalar_one_or_none()
    await asyncio.to_thread(realtime.push_message, realtime.rtdb_key(conv), out.model_dump(), drop_id)
    await _refresh_inboxes(db, conv)
    await _push_message(db, conv, current_user, msg.body)
    return out


async def _push_message(db: AsyncSession, conv: Conversation, author: User, body: str) -> None:
    """Lot 7 : notification push aux membres (privé, groupe), sauf sourdine et blocage."""
    if conv.kind not in (ConversationKind.PRIVATE, ConversationKind.GROUP):
        return
    members = await _members(db, conv)
    blockers = set((await db.execute(select(UserBlock.blocker_id).where(
        UserBlock.blocked_id == author.id,
        UserBlock.blocker_id.in_([u.id for _, u in members]),
    ))).scalars().all())
    recipients = [(u.firebase_uid, _title(conv, members, u.id) or "")
                  for m, u in members if u.id != author.id and not m.muted and u.id not in blockers]
    push_service.new_message(conv.id, recipients, author.display_name, body)


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT, summary="Marquer comme lu")
async def mark_read(conversation_id: int, body: Optional[ReadIn] = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _conversation(db, conversation_id)
    member = await _readable(db, conv, current_user)
    if member is None:
        return
    latest = (await db.execute(select(func.max(Message.id)).where(Message.conversation_id == conv.id))).scalar_one() or 0
    target = min(body.message_id, latest) if body and body.message_id else latest
    if target > member.last_read_id:
        member.last_read_id = target
        await db.flush()
    members = await _members(db, conv)
    last = await _last_message(db, conv.id)
    await asyncio.to_thread(realtime.set_inbox, current_user.firebase_uid, conv.id, {
        "kind": conv.kind, "title": _title(conv, members, current_user.id),
        "preview": _preview(last[1], last[0].body) if last else None,
        "last_at": _ms(conv.last_message_at), "unread": await _unread(db, conv.id, member), "muted": bool(member.muted),
    })


async def _delete_message(db: AsyncSession, msg: Message, by: User) -> None:
    if msg.deleted_at is not None:
        return
    msg.deleted_at = _utcnow()
    msg.deleted_by = by.id
    await db.flush()
    conv = await db.get(Conversation, msg.conversation_id)
    await asyncio.to_thread(realtime.mark_deleted, realtime.rtdb_key(conv), msg.id)
    await _refresh_inboxes(db, conv)


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un message")
async def delete_message(message_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    if msg.author_id != current_user.id:
        _require_admin(current_user)
    await _delete_message(db, msg, current_user)


@router.post("/messages/{message_id}/report", status_code=status.HTTP_204_NO_CONTENT, summary="Signaler un message")
async def report_message(message_id: int, body: Optional[ReportIn] = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if msg is None or msg.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    conv = await db.get(Conversation, msg.conversation_id)
    await _readable(db, conv, current_user)          # on ne signale que ce qu'on peut lire
    if msg.author_id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas signaler votre propre message.")
    exists = (await db.execute(select(MessageReport.id).where(
        MessageReport.message_id == msg.id, MessageReport.reporter_id == current_user.id))).first()
    if exists is None:
        db.add(MessageReport(message_id=msg.id, reporter_id=current_user.id,
                             reason=body.reason if body else None, created_at=_utcnow()))
        await db.flush()
        logger.info("Message %d signalé par user %d", msg.id, current_user.id)


# ── Administration ────────────────────────────────────────────────

@router.get("/admin/reports", response_model=list[ReportOut], summary="Signalements en attente (admin)")
async def list_reports(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(current_user)
    rows = (await db.execute(
        select(MessageReport, Message, Conversation.kind, User.display_name)
        .join(Message, Message.id == MessageReport.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(User, User.id == MessageReport.reporter_id)
        .where(MessageReport.resolved_at.is_(None))
        .order_by(MessageReport.created_at.desc())
    )).all()
    counts = {}
    for rep, msg, _, _ in rows:
        counts[msg.id] = counts.get(msg.id, 0) + 1
    authors = {}
    ids = {msg.author_id for _, msg, _, _ in rows if msg.author_id}
    if ids:
        authors = dict((await db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))).all())
    seen, out = set(), []
    for rep, msg, kind, reporter in rows:        # un signalement par message (le plus récent)
        if msg.id in seen:
            continue
        seen.add(msg.id)
        out.append(ReportOut(
            id=rep.id, message=_message_out(msg, authors.get(msg.author_id, "?")), conversation_kind=kind,
            reporter_name=reporter, reason=rep.reason, reports_count=counts[msg.id], created_at=_as_utc(rep.created_at),
        ))
    return out


class ResolveIn(BaseModel):
    action: Literal["dismiss", "delete"] = "dismiss"


@router.post("/admin/reports/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT, summary="Traiter un signalement (admin)")
async def resolve_report(report_id: int, body: Optional[ResolveIn] = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(current_user)
    rep = await db.get(MessageReport, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Signalement introuvable.")
    msg = await db.get(Message, rep.message_id)
    if body and body.action == "delete" and msg is not None:
        await _delete_message(db, msg, current_user)
    # Tous les signalements du même message sont traités ensemble
    for other in (await db.execute(select(MessageReport).where(
            MessageReport.message_id == rep.message_id, MessageReport.resolved_at.is_(None)))).scalars().all():
        other.resolved_at = _utcnow()
        other.resolved_by = current_user.id
    await db.flush()


@router.post("/admin/users/{user_id}/mute", status_code=status.HTTP_204_NO_CONTENT, summary="Rendre un joueur muet (admin)")
async def mute_user(user_id: int, body: AdminMuteIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(current_user)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    user.chat_muted_until = _utcnow() + timedelta(minutes=body.minutes) if body.minutes else None
    await db.flush()
    logger.info("Admin %d : user %d muet %d min", current_user.id, user_id, body.minutes)


@router.put("/admin/global/slow-mode", response_model=ConversationOut, summary="Mode lent du salon universel (admin)")
async def set_slow_mode(body: SlowModeIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(current_user)
    glob = await get_global(db)
    glob.slow_mode_s = body.seconds
    await db.flush()
    try:
        await asyncio.to_thread(realtime._update, f"/chat/{GLOBAL_KEY}", {"slow_mode_s": body.seconds})
    except Exception:
        pass
    return await _conversation_out(db, glob, current_user)
