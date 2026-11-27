# app/appconfig/router.py
#
# Configuration publique (lot A2), lue par tous les clients, connectés ou non :
#   GET /config                   politique des paramètres (défauts, verrous, options)
#   GET /config/privacy-policy    politique de confidentialité modifiée par l'admin
#                                 (custom: false → le client affiche son texte d'origine)
# Sans base de données, les valeurs d'origine sont servies : le jeu reste jouable.
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.appconfig import service
from app.appconfig.catalog import builtin_policy, public_policy
from app.db import database

router = APIRouter(prefix="/config", tags=["Configuration"])

CACHE_HEADER = "public, max-age=60"


class PublicConfig(BaseModel):
    settings: dict
    updated_at: Optional[datetime] = None


class PublicPrivacyPolicy(BaseModel):
    custom: bool
    document: Optional[dict] = None
    updated_at: Optional[datetime] = None


@router.get("", response_model=PublicConfig, summary="Paramètres fixés par l'administrateur")
async def public_config(response: Response):
    response.headers["Cache-Control"] = CACHE_HEADER
    if database.AsyncSessionLocal is None:
        return PublicConfig(settings=public_policy(builtin_policy()))
    async with database.AsyncSessionLocal() as session:
        policy = await service.get_policy(session)
        row = await service.get_row(session, service.SETTINGS_KEY)
    return PublicConfig(settings=public_policy(policy), updated_at=row.updated_at if row else None)


@router.get("/privacy-policy", response_model=PublicPrivacyPolicy, summary="Politique de confidentialité")
async def public_privacy_policy(response: Response):
    response.headers["Cache-Control"] = CACHE_HEADER
    if database.AsyncSessionLocal is None:
        return PublicPrivacyPolicy(custom=False)
    async with database.AsyncSessionLocal() as session:
        row = await service.get_row(session, service.PRIVACY_KEY)
    if row is None:
        return PublicPrivacyPolicy(custom=False)
    doc = {k: v for k, v in row.value.items() if k != "note"}
    return PublicPrivacyPolicy(custom=True, document=doc, updated_at=row.updated_at)


# ── Lot A4 : champs du profil (formulaire « Mon profil ») ──────────

@router.get("/profile", summary="Champs du profil exigés, facultatifs ou non demandés")
async def public_profile_rules(response: Response):
    from app.appconfig.profile import builtin_profile_rules, get_profile_rules
    response.headers["Cache-Control"] = CACHE_HEADER
    if database.AsyncSessionLocal is None:
        return builtin_profile_rules().model_dump()
    async with database.AsyncSessionLocal() as session:
        return (await get_profile_rules(session)).model_dump()
