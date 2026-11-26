# app/appconfig/privacy_doc.py
#
# Politique de confidentialité modifiable (lot A2). Texte brut uniquement : le
# client l'affiche comme du texte (aucun HTML interprété). Sans document en base,
# le client affiche le texte livré avec l'application (frontend/src/i18n/privacy.js).
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _clean(v: str) -> str:
    v = "".join(ch for ch in (v or "") if ch == "\n" or ch.isprintable())
    return v.strip()


class PolicySection(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    warning: bool = False
    paragraphs: list[str] = Field(default_factory=list, max_length=20)
    items: list[str] = Field(default_factory=list, max_length=40)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = _clean(v)
        if not v:
            raise ValueError("Chaque section a besoin d'un titre.")
        return v

    @field_validator("paragraphs", "items")
    @classmethod
    def _lines(cls, v: list[str]) -> list[str]:
        out = [_clean(x) for x in v]
        if any(len(x) > 2000 for x in out):
            raise ValueError("2000 caractères au plus par paragraphe ou par point.")
        return [x for x in out if x]


class PolicyLanguage(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    intro: str = Field(default="", max_length=4000)
    contactLabel: str = Field(default="", max_length=200)
    contactFallback: str = Field(default="", max_length=1000)
    sections: list[PolicySection] = Field(min_length=1, max_length=40)

    @field_validator("title", "intro", "contactLabel", "contactFallback")
    @classmethod
    def _text(cls, v: str) -> str:
        return _clean(v)


class PrivacyPolicyDoc(BaseModel):
    updated_on: date                       # « Dernière mise à jour : … »
    fr: PolicyLanguage
    en: PolicyLanguage
    note: Optional[str] = Field(default=None, max_length=200)    # motif, gardé dans le journal
