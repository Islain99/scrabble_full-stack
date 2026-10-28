# app/notifications/router.py
#
# Invitations à jouer et notifications (lot 5).
#
#   POST   /friends/{user_id}/invite             inviter un ami dans sa salle (créée au besoin)
#   GET    /notifications                        invitations et demandes d'ami en attente (repli du temps réel)
#   POST   /invitations/{id}/accept              rejoindre la salle de l'invitation
#   POST   /invitations/{id}/decline             refuser (l'hôte en est averti)
#   DELETE /notifications/{key}                  fermer une notification affichée
#   GET    /multiplayer/rooms/{id}/invitations   suivi des invitations par l'hôte (salle d'attente)
#
# En direct : le serveur dépose chaque notification dans /notifications/{uid}
# (voir app/notifications/service.py).
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.friends.models import Friendship, FriendshipStatus
from app.friends.router import are_friends, is_blocked_between
from app.multiplayer import router as mp
from app.multiplayer.models import MultiplayerGame, RoomSettings, RoomStateResponse, RoomStatus
from app.notifications.models import GameInvitation, InvitationStatus
from app.notifications.service import (
    expire_room_invitations, notify, notify_user, remove_notifications,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notifications"])

MAX_INVITES_PER_HOUR = 20
KEY_RE = re.compile(r"^[a-z]{2,5}-\d{1,12}$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Schémas ───────────────────────────────────────────────────────

class InviteIn(BaseModel):
    """Règles de la salle si elle doit être créée (sinon : salle « Amis seulement » par défaut)."""
    settings: Optional[RoomSettings] = None


class InviteOut(BaseModel):
    invitation_id: int
    room_id:       str
    status:        str


class NotificationOut(BaseModel):
    key:           str
    type:          Literal["game_invite", "friend_request"]
    from_user_id:  int
    from_name:     str
    created_at:    datetime
    invitation_id: Optional[int] = None
    request_id:    Optional[int] = None
    room_id:       Optional[str] = None
    settings:      Optional[RoomSettings] = None


class RoomInvitationOut(BaseModel):
    invitation_id: int
    invitee_id:    int
    invitee_name:  str
    status:        str


def _invite_payload(inv: GameInvitation, inviter: User, rules: RoomSettings) -> dict:
    """Fiche RTDB d'une invitation : de qui, quelle salle, règles principales."""
    return {
        "type": "game_invite",
        "invitation_id": inv.id,
        "room_id": inv.room_id,
        "from_user_id": inviter.id,
        "from_name": inviter.display_name,
        "turn_seconds": rules.turn_seconds,
        "allow_swap": rules.allow_swap,
        "target_score": rules.target_score,
    }


# ── Inviter ───────────────────────────────────────────────────────

@router.post("/friends/{user_id}/invite", response_model=InviteOut, summary="Inviter un ami à jouer")
async def invite_friend(
    user_id: int,
    request: Request,
    body: Optional[InviteIn] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp._get_engine(request)
    if not await are_friends(db, current_user.id, user_id) or await is_blocked_between(db, current_user.id, user_id):
        raise HTTPException(status_code=403, detail="Vous ne pouvez inviter que vos amis.")
    friend = (await db.execute(select(User).where(User.id == user_id, User.is_active == True))).scalar_one_or_none()  # noqa: E712
    if friend is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    sent_last_hour = (await db.execute(select(func.count()).select_from(GameInvitation).where(
        GameInvitation.inviter_id == current_user.id,
        GameInvitation.created_at >= _utcnow() - timedelta(hours=1),
    ))).scalar_one()
    if sent_last_hour >= MAX_INVITES_PER_HOUR:
        raise HTTPException(status_code=429, detail="Trop d'invitations envoyées. Réessayez plus tard.")

    # Sa salle en attente (créée au besoin) ; une partie en cours → 409
    rules = (body.settings if body and body.settings else RoomSettings(visibility="friends"))
    created = await mp._create_waiting_room(db, current_user, rules)
    room = await mp._get_room_or_404(created.room_id, db)
    room_rules = mp._room_settings(room)

    existing = (await db.execute(select(GameInvitation).where(
        GameInvitation.room_id == room.room_id, GameInvitation.invitee_id == user_id,
        GameInvitation.status == InvitationStatus.PENDING,
    ))).scalar_one_or_none()
    inv = existing
    if inv is None:
        inv = GameInvitation(room_id=room.room_id, inviter_id=current_user.id, invitee_id=user_id,
                             status=InvitationStatus.PENDING, created_at=_utcnow())
        db.add(inv)
        await db.flush()
        logger.info("Invitation %d : user %d invite %d dans %s", inv.id, current_user.id, user_id, room.room_id)
    await notify(friend.firebase_uid, f"inv-{inv.id}", _invite_payload(inv, current_user, room_rules))
    return InviteOut(invitation_id=inv.id, room_id=room.room_id, status=inv.status)


# ── Liste (repli) ─────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationOut], summary="Invitations et demandes d'ami en attente")
async def list_notifications(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = current_user.id
    out: list[NotificationOut] = []

    invites = (await db.execute(
        select(GameInvitation, User, MultiplayerGame)
        .join(User, User.id == GameInvitation.inviter_id)
        .join(MultiplayerGame, MultiplayerGame.room_id == GameInvitation.room_id)
        .where(GameInvitation.invitee_id == me, GameInvitation.status == InvitationStatus.PENDING,
               MultiplayerGame.status == RoomStatus.WAITING.value)
    )).all()
    for inv, inviter, room in invites:
        out.append(NotificationOut(
            key=f"inv-{inv.id}", type="game_invite", from_user_id=inviter.id, from_name=inviter.display_name,
            created_at=mp._as_utc(inv.created_at), invitation_id=inv.id, room_id=inv.room_id,
            settings=mp._room_settings(room),
        ))

    requests = (await db.execute(
        select(Friendship, User).join(User, User.id == Friendship.requester_id)
        .where(Friendship.addressee_id == me, Friendship.status == FriendshipStatus.PENDING)
    )).all()
    for req, requester in requests:
        out.append(NotificationOut(
            key=f"fr-{req.id}", type="friend_request", from_user_id=requester.id, from_name=requester.display_name,
            created_at=mp._as_utc(req.created_at), request_id=req.id,
        ))
    out.sort(key=lambda n: n.created_at, reverse=True)
    return out


# ── Répondre à une invitation ─────────────────────────────────────

async def _my_invitation(db: AsyncSession, invitation_id: int, me: int) -> GameInvitation:
    inv = await db.get(GameInvitation, invitation_id)
    if inv is None or inv.invitee_id != me:
        raise HTTPException(status_code=404, detail="Invitation introuvable.")
    return inv


@router.post("/invitations/{invitation_id}/accept", response_model=RoomStateResponse, summary="Accepter une invitation")
async def accept_invitation(
    invitation_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = mp._get_engine(request)
    inv = await _my_invitation(db, invitation_id, current_user.id)
    room = (await db.execute(select(MultiplayerGame).where(MultiplayerGame.room_id == inv.room_id))).scalar_one_or_none()
    if inv.status != InvitationStatus.PENDING or room is None or room.status != RoomStatus.WAITING:
        inv.status = InvitationStatus.EXPIRED if inv.status == InvitationStatus.PENDING else inv.status
        await db.flush()
        await notify(current_user.firebase_uid, f"inv-{inv.id}", None)
        raise HTTPException(status_code=409, detail="Cette invitation a expiré.")

    response = await mp._join_waiting_room(inv.room_id, current_user, db, engine)
    inv.status = InvitationStatus.ACCEPTED
    inv.responded_at = _utcnow()
    await db.flush()
    await notify(current_user.firebase_uid, f"inv-{inv.id}", None)
    return response


@router.post("/invitations/{invitation_id}/decline", status_code=status.HTTP_204_NO_CONTENT, summary="Refuser une invitation")
async def decline_invitation(invitation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    inv = await _my_invitation(db, invitation_id, current_user.id)
    await notify(current_user.firebase_uid, f"inv-{inv.id}", None)
    if inv.status != InvitationStatus.PENDING:
        return
    inv.status = InvitationStatus.DECLINED
    inv.responded_at = _utcnow()
    await db.flush()
    # L'hôte est averti (dans sa cloche et dans sa salle d'attente)
    await notify_user(db, inv.inviter_id, f"invd-{inv.id}", {
        "type": "invite_declined", "from_user_id": current_user.id,
        "from_name": current_user.display_name, "room_id": inv.room_id,
    })


@router.delete("/notifications/{key}", status_code=status.HTTP_204_NO_CONTENT, summary="Fermer une notification")
async def dismiss_notification(key: str, current_user: User = Depends(get_current_user)):
    if not KEY_RE.match(key):
        raise HTTPException(status_code=422, detail="Notification inconnue.")
    await notify(current_user.firebase_uid, key, None)


# ── Suivi par l'hôte ──────────────────────────────────────────────

@router.get("/multiplayer/rooms/{room_id}/invitations", response_model=list[RoomInvitationOut],
            summary="Invitations envoyées pour cette salle (hôte)")
async def room_invitations(room_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    room = await mp._get_room_or_404(mp._normalize_room_id(room_id), db)
    if room.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul l'hôte suit les invitations de sa salle.")
    rows = (await db.execute(
        select(GameInvitation, User.display_name).join(User, User.id == GameInvitation.invitee_id)
        .where(GameInvitation.room_id == room.room_id).order_by(GameInvitation.id)
    )).all()
    latest: dict[int, RoomInvitationOut] = {}
    for inv, name in rows:   # la plus récente par invité
        latest[inv.invitee_id] = RoomInvitationOut(
            invitation_id=inv.id, invitee_id=inv.invitee_id, invitee_name=name, status=inv.status)
    return list(latest.values())


__all__ = ["router", "expire_room_invitations", "remove_notifications"]
