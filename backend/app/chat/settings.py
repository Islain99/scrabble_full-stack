# app/chat/settings.py
#
# Règles de la messagerie réglées depuis le dashboard (lot A4), gardées dans
# app_config (clé « chat »). Sans document en base : le comportement d'avant
# (lot 6) — filtre d'origine en masquage, liens refusés aux comptes de moins de
# 24 h, 2 s entre deux messages, 20 par minute, 500 caractères.
from __future__ import annotations

import logging
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.appconfig import service as config_service

logger = logging.getLogger(__name__)

CHAT_KEY = "chat"
MAX_BODY_LIMIT = 500          # plafond technique (colonne, temps réel)

_WORD_OK = re.compile(r"^[\w'\- ]{2,40}$", re.UNICODE)


class ChatRules(BaseModel):
    # Salon universel : ouvert à tous, ou en lecture seule (seuls les admins écrivent)
    global_enabled: bool = True
    # Règles affichées en tête du salon universel (texte brut ; vide = rien)
    rules_fr: str = Field("", max_length=1500)
    rules_en: str = Field("", max_length=1500)
    # Filtre de mots : liste d'origine (FR/EN) + mots ajoutés ; masquer (***) ou refuser le message
    builtin_words: bool = True
    extra_words: list[str] = Field(default_factory=list, max_length=300)
    filter_mode: Literal["mask", "block"] = "mask"
    # Liens : tous permis, refusés aux comptes récents, ou refusés à tous (sauf admins)
    links: Literal["all", "new_accounts", "none"] = "new_accounts"
    link_min_age_hours: int = Field(24, ge=1, le=24 * 30)
    # Cadence et longueur
    max_length: int = Field(MAX_BODY_LIMIT, ge=20, le=MAX_BODY_LIMIT)
    min_interval_s: int = Field(2, ge=0, le=300)
    max_per_minute: int = Field(20, ge=1, le=120)

    @field_validator("rules_fr", "rules_en")
    @classmethod
    def _text(cls, v: str) -> str:
        return "".join(ch for ch in (v or "") if ch == "\n" or ch.isprintable()).strip()

    @field_validator("extra_words")
    @classmethod
    def _words(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for w in v:
            w = " ".join((w or "").split()).lower()
            if not w:
                continue
            if not _WORD_OK.match(w):
                raise ValueError(f"Mot interdit invalide : « {w[:40]} » (2 à 40 lettres, chiffres, ' ou -).")
            if w not in out:
                out.append(w)
        return out


def builtin_chat_rules() -> ChatRules:
    return ChatRules()


async def get_chat_rules(db: AsyncSession) -> ChatRules:
    row = await config_service.get_row(db, CHAT_KEY)
    if row is None:
        return builtin_chat_rules()
    try:
        return ChatRules.model_validate(row.value)
    except Exception as exc:                      # document abîmé : on n'empêche pas d'écrire
        logger.error("Règles de la messagerie invalides en base : %s", exc)
        return builtin_chat_rules()
