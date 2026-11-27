# app/announcements/service.py
#
# Ciblage et diffusion des annonces (lot A4).
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.announcements.models import Announcement, AnnouncementStatus
from app.push import service as push_service

logger = logging.getLogger(__name__)

RTDB_CHUNK = 400


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def default_tier_id(db: AsyncSession) -> Optional[int]:
    from app.economy.models import SubscriptionTier
    return (await db.execute(select(SubscriptionTier.id).where(SubscriptionTier.is_default.is_(True)))).scalar_one_or_none()


def matches(ann: Announcement, tier_id: Optional[int], default_id: Optional[int], *, logged_in: bool) -> bool:
    """Le joueur (niveau en vigueur tier_id ; None = défaut) fait-il partie du public ?"""
    if ann.audience_tiers is None:
        return True
    if not logged_in:
        return False
    effective = tier_id if tier_id is not None else default_id
    return effective in set(ann.audience_tiers)


def is_live(ann: Announcement, now: Optional[datetime] = None) -> bool:
    now = now or _utcnow()
    starts, ends = _as_utc(ann.starts_at), _as_utc(ann.ends_at)
    return (ann.status == AnnouncementStatus.PUBLISHED
            and (starts is None or starts <= now) and (ends is None or ends > now))


async def live_announcements(db: AsyncSession, user=None) -> list[Announcement]:
    """Annonces du bandeau visibles par ce joueur (ou un invité), épinglées d'abord, puis les plus récentes."""
    now = _utcnow()
    rows = (await db.execute(
        select(Announcement).where(
            Announcement.status == AnnouncementStatus.PUBLISHED, Announcement.show_banner.is_(True),
            or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
            or_(Announcement.ends_at.is_(None), Announcement.ends_at > now),
        ).order_by(Announcement.published_at.desc(), Announcement.id.desc()).limit(20)
    )).scalars().all()
    default_id = await default_tier_id(db) if user is not None else None
    tier = user.effective_tier_id() if user is not None else None
    return [a for a in rows if matches(a, tier, default_id, logged_in=user is not None)]


async def recipients(db: AsyncSession, ann: Announcement) -> list[str]:
    """Identifiants Firebase des joueurs actifs du public de l'annonce."""
    from app.db.models import User
    rows = (await db.execute(
        select(User.firebase_uid, User.tier_id, User.tier_expires_at).where(User.is_active.is_(True))
    )).all()
    default_id = await default_tier_id(db)
    now = _utcnow()
    out = []
    for uid, tier_id, expires in rows:
        exp = _as_utc(expires)
        effective = tier_id if tier_id is not None and (exp is None or exp > now) else None
        if uid and matches(ann, effective, default_id, logged_in=True):
            out.append(uid)
    return out


def payload(ann: Announcement) -> dict:
    """Fiche de la cloche (/notifications/{uid}/ann-{id}) : textes dans les deux langues."""
    return {"type": "announcement", "announcement_id": ann.id, "kind": ann.kind,
            "title_fr": ann.title_fr, "title_en": ann.title_en,
            "body_fr": _short(ann.body_fr), "body_en": _short(ann.body_en), "link": ann.link}


def _short(text: str, n: int = 160) -> str:
    text = " ".join((text or "").split())
    return text[:n] + ("…" if len(text) > n else "")


def _fanout_write(uids: list[str], key: str, data: Optional[dict]) -> None:
    """Écrit (ou retire) la fiche chez chaque destinataire, par lots (une requête par lot)."""
    try:
        from firebase_admin import db as rtdb
    except Exception:
        return
    clean = {k: v for k, v in (data or {}).items() if v is not None} if data else None
    for start in range(0, len(uids), RTDB_CHUNK):
        chunk = uids[start:start + RTDB_CHUNK]
        try:
            rtdb.reference("/notifications").update({f"{uid}/{key}": clean for uid in chunk})
        except Exception as exc:
            logger.warning("Annonce : écriture RTDB ignorée (%d destinataires) : %s", len(chunk), exc)


async def notify_all(db: AsyncSession, ann: Announcement) -> int:
    """Cloche (temps réel) et push (catégorie « Annonces ») pour tout le public. Retourne le nombre visé."""
    uids = await recipients(db, ann)
    if not uids:
        return 0
    key = f"ann-{ann.id}"
    data = {"created_at": int(_utcnow().timestamp() * 1000), **payload(ann)}
    await asyncio.to_thread(_fanout_write, uids, key, data)
    push_service.push(uids, "news", "announcement",
                      {"title_fr": ann.title_fr, "title_en": ann.title_en,
                       "body_fr": _short(ann.body_fr, 200), "body_en": _short(ann.body_en, 200)},
                      url=ann.link if (ann.link or "").startswith("#/") else "#/", tag=key)
    return len(uids)


async def withdraw(db: AsyncSession, ann: Announcement) -> None:
    """Annonce archivée ou supprimée : retirée des cloches."""
    if not ann.notified_count:
        return
    uids = await recipients(db, ann)
    await asyncio.to_thread(_fanout_write, uids, f"ann-{ann.id}", None)
