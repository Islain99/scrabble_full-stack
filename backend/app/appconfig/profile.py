# app/appconfig/profile.py
#
# Champs du profil (lot A4), réglés depuis le dashboard et gardés dans app_config
# (clé « profile ») :
#   collect   required → demandé, et nécessaire pour un profil « complet »
#             optional → demandé, facultatif
#             off      → plus demandé (masqué dans le formulaire, ignoré par l'API)
#   public    (bio, pays, photo seulement) montré aux autres joueurs sur le profil
#             public. Prénom, nom et âge ne sont jamais montrés aux autres
#             (promesse de la politique de confidentialité).
# Sans document en base : le comportement d'avant (prénom, nom, âge, pays exigés ;
# bio et photo facultatives ; bio, pays et photo visibles).
from __future__ import annotations

import logging
from typing import Literal

from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.appconfig import service as config_service

logger = logging.getLogger(__name__)

PROFILE_KEY = "profile"

# champ : (collecte d'origine, visible d'origine ou None si jamais public)
FIELDS: dict[str, tuple[str, bool | None]] = {
    "first_name": ("required", None),
    "last_name":  ("required", None),
    "age":        ("required", None),
    "country":    ("required", True),
    "bio":        ("optional", True),
    "avatar_url": ("optional", True),
}


class FieldRule(BaseModel):
    collect: Literal["required", "optional", "off"]
    public: bool = False


class ProfileRules(BaseModel):
    fields: dict[str, FieldRule] = {}
    min_age: int = 5                   # âge minimal accepté (5 à 18)

    @model_validator(mode="after")
    def _complete(self) -> "ProfileRules":
        unknown = set(self.fields) - set(FIELDS)
        if unknown:
            raise ValueError(f"Champs inconnus : {sorted(unknown)}")
        if not 5 <= self.min_age <= 18:
            raise ValueError("L'âge minimal va de 5 à 18 ans.")
        full = {}
        for name, (collect, public) in FIELDS.items():
            rule = self.fields.get(name) or FieldRule(collect=collect, public=bool(public))
            if public is None:
                rule = FieldRule(collect=rule.collect, public=False)     # jamais public
            elif rule.collect == "off":
                rule = FieldRule(collect="off", public=False)            # pas demandé → rien à montrer
            full[name] = rule
        self.fields = full
        return self

    def required(self) -> list[str]:
        return [n for n, r in self.fields.items() if r.collect == "required"]

    def off(self) -> set[str]:
        return {n for n, r in self.fields.items() if r.collect == "off"}

    def hidden_public(self) -> set[str]:
        """Champs publics par nature (bio, pays, photo) que l'admin ne montre pas."""
        return {n for n, (_, public) in FIELDS.items() if public is not None and not self.fields[n].public}


def builtin_profile_rules() -> ProfileRules:
    return ProfileRules()


async def get_profile_rules(db: AsyncSession) -> ProfileRules:
    row = await config_service.get_row(db, PROFILE_KEY)
    if row is None:
        return builtin_profile_rules()
    try:
        return ProfileRules.model_validate(row.value)
    except Exception as exc:
        logger.error("Règles du profil invalides en base : %s", exc)
        return builtin_profile_rules()


def is_complete(user, rules: ProfileRules) -> bool:
    """Pseudo toujours requis, puis les champs que l'admin exige."""
    return all(getattr(user, f, None) not in (None, "") for f in ("display_name", *rules.required()))
