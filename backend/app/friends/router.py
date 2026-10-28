# app/friends/router.py
#
# Amis, demandes, groupes et blocages (lot 4).
#
#   GET    /friends                          vue d'ensemble : code ami, amis, demandes, groupes, blocages
#   POST   /friends/requests                 demande par code ami ou identifiant (réciproque → acceptée)
#   POST   /friends/requests/{id}/accept     accepter (destinataire)
#   POST   /friends/requests/{id}/decline    refuser (destinataire ; le demandeur n'en sait rien)
#   DELETE /friends/requests/{id}            annuler sa demande (demandeur)
#   DELETE /friends/{user_id}                retirer un ami
#   POST   /friends/groups                   créer un groupe
#   PATCH  /friends/groups/{id}              renommer, changer la couleur ou l'ordre
#   DELETE /friends/groups/{id}              supprimer un groupe
#   PUT    /friends/groups/{id}/members      ranger des amis dans un groupe
#   GET    /users/search?q=…                 chercher un joueur (pseudo ou code ami)
#   POST   /users/{id}/block · DELETE        bloquer, débloquer
#
# L'adresse e-mail n'est jamais renvoyée. Le uid Firebase d'un ami lui est
# donné (lecture de sa présence) ; jamais celui d'un inconnu.
#
# Présence : le serveur recopie la liste d'amis dans RTDB (/friends/{uid}/{ami}: true) ;
# les règles Firebase n'autorisent la lecture de /presence/{uid} qu'à ses amis.
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.friends.codes import normalize_code, random_code
from app.notifications.service import notify
from app.friends.models import (
    FriendGroup, FriendGroupMember, Friendship, FriendshipStatus, UserBlock,
)

logger = logging.getLogger(__name__)

router       = APIRouter(prefix="/friends", tags=["Amis"])
users_router = APIRouter(prefix="/users",   tags=["Amis"])

# Limites anti-harcèlement (doc d'analyse, lot 4)
MAX_FRIENDS          = 200
MAX_GROUPS           = 20
MAX_PENDING_INCOMING = 50
MAX_SENT_PER_HOUR    = 10
SEARCH_LIMIT         = 20

GROUP_COLORS = ("olive", "gold", "brick", "tobacco", "blue", "plum")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


# ── Schémas ───────────────────────────────────────────────────────

class PublicUser(BaseModel):
    """Ce qu'un joueur voit d'un autre : jamais d'e-mail ni d'identifiant Firebase."""
    user_id:      int
    display_name: str
    friend_code:  Optional[str] = None
    avatar_url:   Optional[str] = None
    country:      Optional[str] = None
    games_played: int = 0
    games_won:    int = 0


class FriendOut(PublicUser):
    firebase_uid: str               # lecture de sa présence (règles Firebase)
    group_ids:    list[int] = []
    since:        Optional[datetime] = None


class RequestOut(BaseModel):
    id:         int
    user:       PublicUser
    created_at: datetime


class GroupOut(BaseModel):
    id:         int
    name:       str
    color:      str
    position:   int
    member_ids: list[int] = []


class FriendsOverview(BaseModel):
    my_code:  str
    friends:  list[FriendOut]
    incoming: list[RequestOut]
    outgoing: list[RequestOut]
    groups:   list[GroupOut]
    blocked:  list[PublicUser]


class SearchResult(PublicUser):
    relation: Literal["friend", "incoming", "outgoing", "none"] = "none"


class FriendRequestIn(BaseModel):
    friend_code: Optional[str] = None
    user_id:     Optional[int] = None


class FriendRequestResult(BaseModel):
    status:     Literal["pending", "accepted"]
    request_id: int
    user:       PublicUser


def _clean_name(value: str) -> str:
    cleaned = " ".join("".join(ch for ch in (value or "") if ch.isprintable()).split())
    if not cleaned:
        raise ValueError("Le nom du groupe est obligatoire.")
    if len(cleaned) > 30:
        raise ValueError("Le nom du groupe compte 30 caractères au plus.")
    return cleaned


class GroupIn(BaseModel):
    name:  str
    color: str = "olive"

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("color")
    @classmethod
    def _color(cls, v: str) -> str:
        if v not in GROUP_COLORS:
            raise ValueError("Couleur inconnue.")
        return v


class GroupPatch(BaseModel):
    name:     Optional[str] = None
    color:    Optional[str] = None
    position: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _clean_name(v)

    @field_validator("color")
    @classmethod
    def _color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in GROUP_COLORS:
            raise ValueError("Couleur inconnue.")
        return v


class GroupMembersIn(BaseModel):
    friend_ids: list[int]


# ── Firebase : liste d'amis recopiée pour les règles de présence ──

def _friends_write(owner_uid: str, friends: dict) -> None:
    """Remplace /friends/{owner_uid} par {uid_ami: true, …} (synchrone, erreurs ignorées)."""
    try:
        from firebase_admin import db as rtdb
        rtdb.reference(f"/friends/{owner_uid}").set(friends or None)
    except Exception as exc:
        logger.warning("Amis : écriture RTDB ignorée (uid=%s) : %s", owner_uid, exc)


def _friend_link_write(uid_a: str, uid_b: str, linked: bool) -> None:
    """Ajoute ou retire le lien d'amitié dans les deux sens (synchrone, erreurs ignorées)."""
    try:
        from firebase_admin import db as rtdb
        for owner, other in ((uid_a, uid_b), (uid_b, uid_a)):
            node = rtdb.reference(f"/friends/{owner}/{other}")
            node.set(True) if linked else node.delete()
    except Exception as exc:
        logger.warning("Amis : lien RTDB ignoré (%s ↔ %s) : %s", uid_a, uid_b, exc)


async def _mirror_link(db: AsyncSession, a: int, b: int, linked: bool) -> None:
    rows = (await db.execute(select(User.id, User.firebase_uid).where(User.id.in_([a, b])))).all()
    uids = {i: uid for i, uid in rows}
    if a in uids and b in uids:
        await asyncio.to_thread(_friend_link_write, uids[a], uids[b], linked)


# ── Helpers ───────────────────────────────────────────────────────

async def ensure_friend_code(db: AsyncSession, user: User) -> str:
    """Code ami du joueur, créé à la première demande (comptes créés après la migration)."""
    if user.friend_code:
        return user.friend_code
    for attempt in range(30):
        code = random_code(user.display_name, digits=4 if attempt < 20 else 6)
        taken = await db.execute(select(User.id).where(User.friend_code == code))
        if taken.first() is None:
            # UPDATE explicite : l'objet peut venir d'une autre session (dépendance d'auth)
            await db.execute(update(User).where(User.id == user.id).values(friend_code=code))
            user.friend_code = code
            return code
    raise HTTPException(status_code=503, detail="Impossible de générer un code ami, réessayez.")


def _public(user: User) -> PublicUser:
    return PublicUser(
        user_id=user.id, display_name=user.display_name, friend_code=user.friend_code,
        avatar_url=user.avatar_url, country=user.country,
        games_played=user.games_played or 0, games_won=user.games_won or 0,
    )


async def _relation_row(db: AsyncSession, a: int, b: int) -> Optional[Friendship]:
    low, high = _pair(a, b)
    return (await db.execute(
        select(Friendship).where(Friendship.user_low == low, Friendship.user_high == high)
    )).scalar_one_or_none()


async def are_friends(db: AsyncSession, a: int, b: int) -> bool:
    """Utilisé ailleurs (salle « Amis seulement »)."""
    if a == b:
        return False
    row = await _relation_row(db, a, b)
    return row is not None and row.status == FriendshipStatus.ACCEPTED


async def is_blocked_between(db: AsyncSession, a: int, b: int) -> bool:
    """Vrai si l'un des deux a bloqué l'autre."""
    row = (await db.execute(select(UserBlock).where(or_(
        and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
        and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a),
    )))).first()
    return row is not None


async def _friend_count(db: AsyncSession, user_id: int) -> int:
    return (await db.execute(select(func.count()).select_from(Friendship).where(
        Friendship.status == FriendshipStatus.ACCEPTED,
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    ))).scalar_one()


async def _remove_from_groups(db: AsyncSession, owner_id: int, friend_id: int) -> None:
    group_ids = select(FriendGroup.id).where(FriendGroup.owner_id == owner_id)
    await db.execute(delete(FriendGroupMember).where(
        FriendGroupMember.friend_id == friend_id, FriendGroupMember.group_id.in_(group_ids),
    ))


async def _end_friendship(db: AsyncSession, a: int, b: int) -> bool:
    """Supprime la relation (quelle qu'elle soit) et les rangements dans les groupes. Vrai si amis."""
    row = await _relation_row(db, a, b)
    was_friend = row is not None and row.status == FriendshipStatus.ACCEPTED
    if row is not None:
        await db.delete(row)
    await _remove_from_groups(db, a, b)
    await _remove_from_groups(db, b, a)
    await db.flush()
    return was_friend


async def _get_user(db: AsyncSession, user_id: int) -> Optional[User]:
    return (await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )).scalar_one_or_none()


async def _own_group(db: AsyncSession, group_id: int, owner_id: int) -> FriendGroup:
    group = await db.get(FriendGroup, group_id)
    if group is None or group.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Groupe introuvable.")
    return group


# ── Vue d'ensemble ────────────────────────────────────────────────

@router.get("", response_model=FriendsOverview, summary="Amis, demandes, groupes et blocages")
async def overview(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = current_user.id
    my_code = await ensure_friend_code(db, current_user)

    rows = (await db.execute(select(Friendship).where(
        or_(Friendship.requester_id == me, Friendship.addressee_id == me)
    ))).scalars().all()
    other_ids = {r.other(me) for r in rows}
    blocks = (await db.execute(select(UserBlock).where(UserBlock.blocker_id == me))).scalars().all()
    other_ids |= {b.blocked_id for b in blocks}
    users = {}
    if other_ids:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(other_ids)))).scalars().all()}

    groups = (await db.execute(
        select(FriendGroup).where(FriendGroup.owner_id == me).order_by(FriendGroup.position, FriendGroup.id)
    )).scalars().all()
    members = {}
    if groups:
        for gid, fid in (await db.execute(select(FriendGroupMember.group_id, FriendGroupMember.friend_id)
                                          .where(FriendGroupMember.group_id.in_([g.id for g in groups])))).all():
            members.setdefault(gid, []).append(fid)
    groups_of = {}
    for gid, fids in members.items():
        for fid in fids:
            groups_of.setdefault(fid, []).append(gid)

    friends, incoming, outgoing = [], [], []
    for r in rows:
        other = users.get(r.other(me))
        if other is None or not other.is_active:
            continue
        if r.status == FriendshipStatus.ACCEPTED:
            friends.append(FriendOut(
                **_public(other).model_dump(), firebase_uid=other.firebase_uid,
                group_ids=sorted(groups_of.get(other.id, [])), since=r.responded_at or r.created_at,
            ))
        elif r.requester_id == me:
            # Refusée : le demandeur la voit toujours en attente (anti-harcèlement)
            outgoing.append(RequestOut(id=r.id, user=_public(other), created_at=r.created_at))
        elif r.status == FriendshipStatus.PENDING:
            incoming.append(RequestOut(id=r.id, user=_public(other), created_at=r.created_at))
    friends.sort(key=lambda f: f.display_name.lower())
    incoming.sort(key=lambda q: q.created_at, reverse=True)
    outgoing.sort(key=lambda q: q.created_at, reverse=True)

    # Réparation de la copie Firebase de MA liste (mes amis peuvent lire ma présence)
    await asyncio.to_thread(_friends_write, current_user.firebase_uid, {f.firebase_uid: True for f in friends})

    return FriendsOverview(
        my_code=my_code,
        friends=friends,
        incoming=incoming,
        outgoing=outgoing,
        groups=[GroupOut(id=g.id, name=g.name, color=g.color, position=g.position,
                         member_ids=sorted(members.get(g.id, []))) for g in groups],
        blocked=[_public(users[b.blocked_id]) for b in blocks if b.blocked_id in users],
    )


# ── Demandes ──────────────────────────────────────────────────────

@router.post("/requests", response_model=FriendRequestResult, summary="Demander un joueur en ami")
async def send_request(
    body: FriendRequestIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = current_user.id
    target: Optional[User] = None
    if body.friend_code:
        code = normalize_code(body.friend_code)
        if code:
            target = (await db.execute(
                select(User).where(User.friend_code == code, User.is_active == True)  # noqa: E712
            )).scalar_one_or_none()
    elif body.user_id is not None:
        target = await _get_user(db, body.user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Aucun joueur avec ce code.")
    if target.id == me:
        raise HTTPException(status_code=400, detail="C'est votre propre code.")

    i_blocked = (await db.execute(select(UserBlock).where(
        UserBlock.blocker_id == me, UserBlock.blocked_id == target.id))).first()
    if i_blocked:
        raise HTTPException(status_code=409, detail="Vous avez bloqué ce joueur. Débloquez-le d'abord.")
    if await is_blocked_between(db, me, target.id):
        # Bloqué par l'autre : on ne le dit pas
        raise HTTPException(status_code=404, detail="Aucun joueur avec ce code.")

    row = await _relation_row(db, me, target.id)
    if row is not None:
        if row.status == FriendshipStatus.ACCEPTED:
            raise HTTPException(status_code=409, detail="Vous êtes déjà amis.")
        if row.requester_id == me:
            # Déjà envoyée (ou refusée en silence) : rien ne change
            return FriendRequestResult(status="pending", request_id=row.id, user=_public(target))
        if row.status == FriendshipStatus.PENDING:
            # Il m'avait déjà demandé : la demande réciproque vaut acceptation
            return await _accept(db, row, current_user, target)
        # Je l'avais refusé et je change d'avis : nouvelle demande dans l'autre sens
        await _check_limits(db, me, target.id)
        row.requester_id, row.addressee_id = me, target.id
        row.status, row.created_at, row.responded_at = FriendshipStatus.PENDING, _utcnow(), None
        await db.flush()
        await _notify_request(row, current_user, target)
        return FriendRequestResult(status="pending", request_id=row.id, user=_public(target))

    await _check_limits(db, me, target.id)
    low, high = _pair(me, target.id)
    row = Friendship(requester_id=me, addressee_id=target.id, user_low=low, user_high=high,
                     status=FriendshipStatus.PENDING, created_at=_utcnow())
    db.add(row)
    await db.flush()
    logger.info("Demande d'ami %d → %d", me, target.id)
    await _notify_request(row, current_user, target)
    return FriendRequestResult(status="pending", request_id=row.id, user=_public(target))


async def _notify_request(row: Friendship, requester: User, target: User) -> None:
    """Lot 5 : la demande apparaît tout de suite dans la cloche du destinataire."""
    await notify(target.firebase_uid, f"fr-{row.id}", {
        "type": "friend_request", "request_id": row.id,
        "from_user_id": requester.id, "from_name": requester.display_name,
    })


async def _check_limits(db: AsyncSession, me: int, target_id: int) -> None:
    if await _friend_count(db, me) >= MAX_FRIENDS:
        raise HTTPException(status_code=409, detail=f"Vous avez atteint {MAX_FRIENDS} amis.")
    pending_in = (await db.execute(select(func.count()).select_from(Friendship).where(
        Friendship.addressee_id == target_id, Friendship.status == FriendshipStatus.PENDING,
    ))).scalar_one()
    if pending_in >= MAX_PENDING_INCOMING:
        raise HTTPException(status_code=409, detail="Ce joueur a trop de demandes en attente.")
    sent_last_hour = (await db.execute(select(func.count()).select_from(Friendship).where(
        Friendship.requester_id == me, Friendship.created_at >= _utcnow() - timedelta(hours=1),
    ))).scalar_one()
    if sent_last_hour >= MAX_SENT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Trop de demandes envoyées. Réessayez dans une heure.")


async def _accept(db: AsyncSession, row: Friendship, me: User, other: User) -> FriendRequestResult:
    if await _friend_count(db, me.id) >= MAX_FRIENDS or await _friend_count(db, other.id) >= MAX_FRIENDS:
        raise HTTPException(status_code=409, detail=f"Limite de {MAX_FRIENDS} amis atteinte.")
    row.status = FriendshipStatus.ACCEPTED
    row.responded_at = _utcnow()
    await db.flush()
    await asyncio.to_thread(_friend_link_write, me.firebase_uid, other.firebase_uid, True)
    # Lot 5 : la demande quitte ma cloche ; le demandeur est averti
    await notify(me.firebase_uid, f"fr-{row.id}", None)
    await notify(other.firebase_uid, f"fra-{row.id}", {
        "type": "friend_accepted", "from_user_id": me.id, "from_name": me.display_name,
    })
    logger.info("Amis : %d ↔ %d", me.id, other.id)
    return FriendRequestResult(status="accepted", request_id=row.id, user=_public(other))


async def _incoming_request(db: AsyncSession, request_id: int, me: int) -> Friendship:
    row = await db.get(Friendship, request_id)
    if row is None or row.addressee_id != me or row.status != FriendshipStatus.PENDING:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    return row


@router.post("/requests/{request_id}/accept", response_model=FriendRequestResult, summary="Accepter une demande")
async def accept_request(request_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _incoming_request(db, request_id, current_user.id)
    other = await _get_user(db, row.requester_id)
    if other is None:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    return await _accept(db, row, current_user, other)


@router.post("/requests/{request_id}/decline", status_code=status.HTTP_204_NO_CONTENT, summary="Refuser une demande")
async def decline_request(request_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _incoming_request(db, request_id, current_user.id)
    row.status = FriendshipStatus.DECLINED
    row.responded_at = _utcnow()
    await db.flush()
    await notify(current_user.firebase_uid, f"fr-{row.id}", None)   # le demandeur n'est pas averti


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Annuler sa demande")
async def cancel_request(request_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await db.get(Friendship, request_id)
    if row is None or row.requester_id != current_user.id or row.status == FriendshipStatus.ACCEPTED:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    addressee_id, key = row.addressee_id, f"fr-{row.id}"
    await db.delete(row)
    await db.flush()
    uid = (await db.execute(select(User.firebase_uid).where(User.id == addressee_id))).scalar_one_or_none()
    await notify(uid, key, None)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Retirer un ami")
async def remove_friend(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await are_friends(db, current_user.id, user_id):
        raise HTTPException(status_code=404, detail="Ce joueur n'est pas dans vos amis.")
    await _end_friendship(db, current_user.id, user_id)
    await _mirror_link(db, current_user.id, user_id, False)


# ── Groupes ───────────────────────────────────────────────────────

@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED, summary="Créer un groupe")
async def create_group(body: GroupIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    count = (await db.execute(select(func.count()).select_from(FriendGroup)
                              .where(FriendGroup.owner_id == current_user.id))).scalar_one()
    if count >= MAX_GROUPS:
        raise HTTPException(status_code=409, detail=f"{MAX_GROUPS} groupes au plus.")
    group = FriendGroup(owner_id=current_user.id, name=body.name, color=body.color, position=count)
    db.add(group)
    await db.flush()
    return GroupOut(id=group.id, name=group.name, color=group.color, position=group.position)


@router.patch("/groups/{group_id}", response_model=GroupOut, summary="Modifier un groupe")
async def update_group(group_id: int, body: GroupPatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await _own_group(db, group_id, current_user.id)
    if body.name is not None:
        group.name = body.name
    if body.color is not None:
        group.color = body.color
    if body.position is not None:
        group.position = max(0, body.position)
    await db.flush()
    ids = (await db.execute(select(FriendGroupMember.friend_id).where(FriendGroupMember.group_id == group.id))).scalars().all()
    return GroupOut(id=group.id, name=group.name, color=group.color, position=group.position, member_ids=sorted(ids))


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un groupe")
async def delete_group(group_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await _own_group(db, group_id, current_user.id)
    await db.execute(delete(FriendGroupMember).where(FriendGroupMember.group_id == group.id))
    await db.delete(group)
    await db.flush()


@router.put("/groups/{group_id}/members", response_model=GroupOut, summary="Ranger des amis dans un groupe")
async def set_group_members(group_id: int, body: GroupMembersIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await _own_group(db, group_id, current_user.id)
    wanted = sorted(set(body.friend_ids))
    for fid in wanted:
        if not await are_friends(db, current_user.id, fid):
            raise HTTPException(status_code=422, detail="Seuls vos amis peuvent être rangés dans un groupe.")
    await db.execute(delete(FriendGroupMember).where(FriendGroupMember.group_id == group.id))
    for fid in wanted:
        db.add(FriendGroupMember(group_id=group.id, friend_id=fid))
    await db.flush()
    return GroupOut(id=group.id, name=group.name, color=group.color, position=group.position, member_ids=wanted)


# ── Recherche et blocage ──────────────────────────────────────────

@users_router.get("/search", response_model=list[SearchResult], summary="Chercher un joueur (pseudo ou code ami)")
async def search_users(
    q: str = Query(..., min_length=2, max_length=64),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = current_user.id
    code = normalize_code(q)
    query = select(User).where(User.is_active == True, User.id != me)  # noqa: E712
    if code:
        query = query.where(User.friend_code == code)
    else:
        pattern = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(User.display_name.ilike(pattern, escape="\\")).order_by(
            func.length(User.display_name), User.display_name)
    candidates = (await db.execute(query.limit(SEARCH_LIMIT * 2))).scalars().all()

    ids = [u.id for u in candidates]
    blocked = set()
    relations = {}
    if ids:
        for b in (await db.execute(select(UserBlock).where(or_(
            and_(UserBlock.blocker_id == me, UserBlock.blocked_id.in_(ids)),
            and_(UserBlock.blocked_id == me, UserBlock.blocker_id.in_(ids)),
        )))).scalars().all():
            blocked.add(b.blocked_id if b.blocker_id == me else b.blocker_id)
        for r in (await db.execute(select(Friendship).where(or_(
            and_(Friendship.requester_id == me, Friendship.addressee_id.in_(ids)),
            and_(Friendship.addressee_id == me, Friendship.requester_id.in_(ids)),
        )))).scalars().all():
            other = r.other(me)
            if r.status == FriendshipStatus.ACCEPTED:
                relations[other] = "friend"
            elif r.requester_id == me:
                relations[other] = "outgoing"
            elif r.status == FriendshipStatus.PENDING:
                relations[other] = "incoming"

    results = []
    for u in candidates:
        if u.id in blocked:
            continue
        if not u.friend_code:
            await ensure_friend_code(db, u)
        results.append(SearchResult(**_public(u).model_dump(), relation=relations.get(u.id, "none")))
        if len(results) >= SEARCH_LIMIT:
            break
    return results


@users_router.post("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT, summary="Bloquer un joueur")
async def block_user(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous bloquer vous-même.")
    if await _get_user(db, user_id) is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    exists = await db.get(UserBlock, (current_user.id, user_id))
    if exists is None:
        db.add(UserBlock(blocker_id=current_user.id, blocked_id=user_id, created_at=_utcnow()))
    pending = await _relation_row(db, current_user.id, user_id)
    if pending is not None and pending.status != FriendshipStatus.ACCEPTED:
        # Lot 5 : une demande en attente disparaît aussi de la cloche du destinataire
        uid = (await db.execute(select(User.firebase_uid).where(User.id == pending.addressee_id))).scalar_one_or_none()
        await notify(uid, f"fr-{pending.id}", None)
    was_friend = await _end_friendship(db, current_user.id, user_id)
    if was_friend:
        await _mirror_link(db, current_user.id, user_id, False)


@users_router.delete("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT, summary="Débloquer un joueur")
async def unblock_user(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(UserBlock).where(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id))
    await db.flush()
