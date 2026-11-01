# app/users/privacy.py
#
# Confidentialité (lot 8) : chaque joueur choisit qui voit quoi.
#
#   profil        (photo, présentation, pays, code ami)   everyone | friends | nobody
#   statistiques  (parties, scores, cote, historique)     everyone | friends | nobody
#   présence      (en ligne, en partie, vu il y a…)       friends  | nobody
#   demandes d'ami                                        everyone | code (avec mon code ami seulement)
#   recherche par pseudo                                  oui | non (le code ami marche toujours)
#   classements                                           oui | non
#
# Le pseudo reste toujours visible (parties, messagerie). L'e-mail, le nom,
# le prénom et l'âge ne sont jamais montrés aux autres joueurs.
#
#   GET /users/me/privacy     mes réglages
#   PUT /users/me/privacy     les modifier (champs absents : inchangés)
from __future__ import annotations

import asyncio
import logging
from typing import Iterable, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Confidentialité"])

Audience = Literal["everyone", "friends", "nobody"]


class PrivacySettings(BaseModel):
    profile:     Audience = "everyone"
    stats:       Audience = "everyone"
    presence:    Literal["friends", "nobody"] = "friends"
    requests:    Literal["everyone", "code"] = "everyone"
    search:      bool = True
    leaderboard: bool = True


class PrivacyPatch(BaseModel):
    profile:     Optional[Audience] = None
    stats:       Optional[Audience] = None
    presence:    Optional[Literal["friends", "nobody"]] = None
    requests:    Optional[Literal["everyone", "code"]] = None
    search:      Optional[bool] = None
    leaderboard: Optional[bool] = None


FIELDS = {
    "profile": "privacy_profile", "stats": "privacy_stats", "presence": "privacy_presence",
    "requests": "privacy_requests", "search": "privacy_search", "leaderboard": "privacy_leaderboard",
}


def settings_of(user: User) -> PrivacySettings:
    defaults = PrivacySettings()
    return PrivacySettings(**{
        key: (getattr(user, col, None) if getattr(user, col, None) is not None else getattr(defaults, key))
        for key, col in FIELDS.items()
    })


def can_see(audience: Optional[str], *, is_self: bool, is_friend: bool) -> bool:
    """La règle unique : moi toujours, mes amis si « amis » ou « tout le monde »."""
    if is_self:
        return True
    audience = audience or "everyone"
    if audience == "everyone":
        return True
    return audience == "friends" and is_friend


def shows_presence(user: User) -> bool:
    return (getattr(user, "privacy_presence", None) or "friends") != "nobody"


async def friend_ids_of(db: AsyncSession, viewer_id: Optional[int], others: Iterable[int]) -> set[int]:
    """Parmi `others`, ceux qui sont amis de `viewer_id`."""
    from app.friends.models import Friendship, FriendshipStatus
    others = [o for o in set(others) if o is not None and o != viewer_id]
    if viewer_id is None or not others:
        return set()
    rows = (await db.execute(select(Friendship.requester_id, Friendship.addressee_id).where(
        Friendship.status == FriendshipStatus.ACCEPTED,
        or_(
            (Friendship.requester_id == viewer_id) & Friendship.addressee_id.in_(others),
            (Friendship.addressee_id == viewer_id) & Friendship.requester_id.in_(others),
        ),
    ))).all()
    return {b if a == viewer_id else a for a, b in rows}


# ── Routes ────────────────────────────────────────────────────────

@router.get("/me/privacy", response_model=PrivacySettings, summary="Mes réglages de confidentialité")
async def get_privacy(current_user: User = Depends(get_current_user)):
    return settings_of(current_user)


@router.put("/me/privacy", response_model=PrivacySettings, summary="Modifier mes réglages de confidentialité")
async def update_privacy(body: PrivacyPatch, current_user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    before = settings_of(current_user)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(current_user, FIELDS[key], value)
    await db.flush()
    after = settings_of(current_user)

    # Présence : la copie Firebase de ma liste d'amis décide qui peut la lire
    if before.presence != after.presence:
        from app.friends import router as friends_router
        friends = []
        if after.presence != "nobody":
            ids = await friends_router.friend_ids(db, current_user.id)
            if ids:
                friends = (await db.execute(select(User.firebase_uid).where(User.id.in_(ids)))).scalars().all()
        friends_router.forget_mirror(current_user.firebase_uid)
        await asyncio.to_thread(friends_router._friends_write, current_user.firebase_uid,
                                {uid: True for uid in friends})
    logger.info("Confidentialité de user %d : %s", current_user.id, after.model_dump())
    return after
