# app/economy/rules.py
#
# Règles de l'économie de crédits (lot A3), réglées depuis le dashboard et gardées
# dans app_config (clé « economy »). Sans document en base : valeurs d'origine.
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.appconfig.catalog import DIFFICULTIES, PALETTES

Amount = Field(ge=0, le=100_000)


class EconomyRules(BaseModel):
    # Interrupteur général : désactivé, plus aucun gain ni achat (les soldes restent)
    enabled: bool = True

    # ── Gains ─────────────────────────────────────────────────────
    signup_bonus: int = Field(50, ge=0, le=100_000)      # à la création du compte
    daily_login: int = Field(10, ge=0, le=100_000)       # première connexion du jour (UTC)
    solo_win: dict[str, int] = Field(default_factory=lambda: {
        "beginner": 2, "easy": 5, "medium": 10, "hard_minus": 15, "hard": 20})
    mp_win: int = Field(20, ge=0, le=100_000)
    mp_draw: int = Field(10, ge=0, le=100_000)
    mp_loss: int = Field(5, ge=0, le=100_000)            # participation
    # Plafond des gains de parties par jour (UTC) et par joueur ; 0 = sans plafond
    daily_game_cap: int = Field(200, ge=0, le=1_000_000)

    # ── Dépenses ──────────────────────────────────────────────────
    hint_price: int = Field(15, ge=0, le=100_000)        # 0 = indices gratuits
    hints_per_game: int = Field(3, ge=0, le=100)         # 0 = sans limite
    # Palettes premium : palette → prix (absente = gratuite pour tous)
    premium_palettes: dict[str, int] = Field(default_factory=dict)

    @field_validator("solo_win")
    @classmethod
    def _solo(cls, v: dict[str, int]) -> dict[str, int]:
        unknown = set(v) - set(DIFFICULTIES)
        if unknown:
            raise ValueError(f"Difficultés inconnues : {sorted(unknown)}")
        if any(not 0 <= n <= 100_000 for n in v.values()):
            raise ValueError("Les gains doivent être compris entre 0 et 100 000.")
        return {d: int(v.get(d, 0)) for d in DIFFICULTIES}

    @field_validator("premium_palettes")
    @classmethod
    def _palettes(cls, v: dict[str, int]) -> dict[str, int]:
        unknown = set(v) - set(PALETTES)
        if unknown:
            raise ValueError(f"Palettes inconnues : {sorted(unknown)}")
        if any(not 1 <= n <= 100_000 for n in v.values()):
            raise ValueError("Le prix d'une palette premium va de 1 à 100 000 crédits.")
        if len(v) >= len(PALETTES):
            raise ValueError("Au moins une palette doit rester gratuite.")
        return {p: int(v[p]) for p in PALETTES if p in v}      # ordre du catalogue


def builtin_rules() -> EconomyRules:
    return EconomyRules()


# Types de mouvements (grand livre)
EARN_KINDS = ("signup", "daily", "solo_win", "mp_win", "mp_draw", "mp_loss")
GAME_KINDS = ("solo_win", "mp_win", "mp_draw", "mp_loss")     # soumis au plafond quotidien
SPEND_KINDS = ("hint", "unlock")
ADMIN_KINDS = ("admin_grant", "admin_debit")
ALL_KINDS = EARN_KINDS + SPEND_KINDS + ADMIN_KINDS
