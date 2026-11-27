# app/announcements/router.py
#
# GET /announcements : annonces du bandeau pour le joueur connecté (ou un invité :
# seulement celles destinées à tout le monde). Les routes d'administration sont
# dans app/admin/router.py.
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.announcements import service
from app.announcements.models import Announcement
from app.auth.dependencies import get_current_user_optional
from app.db.database import get_db

router = APIRouter(prefix="/announcements", tags=["Annonces"])


class AnnouncementOut(BaseModel):
    id: int
    title_fr: str
    title_en: str
    body_fr: str
    body_en: str
    kind: str
    link: Optional[str]
    published_at: Optional[datetime]
    ends_at: Optional[datetime]

    @classmethod
    def of(cls, a: Announcement) -> "AnnouncementOut":
        return cls(id=a.id, title_fr=a.title_fr, title_en=a.title_en, body_fr=a.body_fr or "",
                   body_en=a.body_en or "", kind=a.kind, link=a.link,
                   published_at=service._as_utc(a.published_at), ends_at=service._as_utc(a.ends_at))


@router.get("", response_model=list[AnnouncementOut], summary="Annonces en cours")
async def current_announcements(user=Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    return [AnnouncementOut.of(a) for a in await service.live_announcements(db, user)]
