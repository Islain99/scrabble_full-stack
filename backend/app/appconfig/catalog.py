# app/appconfig/catalog.py
#
# Dashboard admin, lot A2 : catalogue des paramètres que l'administrateur contrôle
# et règles d'application. Aucun accès à la base ici (fonctions pures, testables).
#
# Chaque paramètre a une « politique » :
#   mode     free   → le joueur choisit (parmi `options`), `default` s'il n'a rien choisi
#            locked → visible mais grisé : tout le monde a `default`
#            hidden → invisible : tout le monde a `default`
#   default  valeur des joueurs qui n'ont rien choisi (et valeur imposée si locked/hidden)
#   options  (choix seulement) valeurs proposées ; une valeur retirée retombe sur `default`
#
# Les clés « privacy.* » correspondent aux colonnes privacy_* de users (lot 8) ;
# « language » est la langue de l'interface, gardée par l'appareil (pas en base).
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, model_validator

# Doivent rester alignés sur users/router.py (validateurs) et sur le frontend
PALETTES = ["vintage", "classique", "ocean", "bordeaux", "ardoise",
            "lavande", "foret", "terracotta", "tournesol", "contraste"]
DIFFICULTIES = ["beginner", "easy", "medium", "hard_minus", "hard"]
TURN_DURATIONS = [0, 60, 120, 180, 300]

# key: (section, type, options, valeur d'origine, verrouillable)
#   type « choice » : une valeur parmi options ; « bool » : oui / non
#   themeMode / colorPalette : None d'origine = « pas de défaut imposé » (le client
#   garde le choix de l'appareil, comportement d'avant le lot A2)
CATALOG: dict[str, tuple[str, str, Optional[list], Any, bool]] = {
    # Apparence
    "themeMode":          ("appearance", "choice", ["light", "dark", "system"], None, True),
    "colorPalette":       ("appearance", "choice", PALETTES, None, True),
    "language":           ("appearance", "choice", ["fr", "en"], "fr", True),
    # Parties
    "difficulty":         ("game", "choice", DIFFICULTIES, "medium", True),
    "gameLanguage":       ("game", "choice", ["fr", "en"], "fr", True),
    "turnDuration":       ("game", "choice", TURN_DURATIONS, 0, True),
    # Affichage
    "showScorePreview":   ("display", "bool", None, True, True),
    "showRemainingTiles": ("display", "bool", None, True, True),
    "showBonusLabels":    ("display", "bool", None, True, True),
    "animationsEnabled":  ("display", "bool", None, True, True),
    # Comportement
    "autoSortRack":       ("behavior", "bool", None, False, True),
    "confirmValidation":  ("behavior", "bool", None, False, True),
    # Notifications push (catégories)
    "pushInvites":        ("notifications", "bool", None, True, True),
    "pushFriends":        ("notifications", "bool", None, True, True),
    "pushMessages":       ("notifications", "bool", None, True, True),
    "pushTurn":           ("notifications", "bool", None, True, True),
    # Confidentialité (colonnes users.privacy_*)
    "privacy.profile":     ("privacy", "choice", ["everyone", "friends", "nobody"], "everyone", True),
    "privacy.stats":       ("privacy", "choice", ["everyone", "friends", "nobody"], "everyone", True),
    # Présence : défaut seulement. La verrouiller obligerait à réécrire en masse la
    # copie Firebase des listes d'amis (règles de lecture de la présence).
    "privacy.presence":    ("privacy", "choice", ["friends", "nobody"], "friends", False),
    "privacy.requests":    ("privacy", "choice", ["everyone", "code"], "everyone", True),
    "privacy.search":      ("privacy", "bool", None, True, True),
    "privacy.leaderboard": ("privacy", "bool", None, True, True),
}

SECTIONS = ["appearance", "game", "display", "behavior", "notifications", "privacy"]
PRIVACY_COLUMNS = {
    "privacy.profile": "privacy_profile", "privacy.stats": "privacy_stats",
    "privacy.presence": "privacy_presence", "privacy.requests": "privacy_requests",
    "privacy.search": "privacy_search", "privacy.leaderboard": "privacy_leaderboard",
}

Mode = Literal["free", "locked", "hidden"]


class SettingPolicy(BaseModel):
    mode: Mode = "free"
    default: Any = None
    options: Optional[list] = None


class SettingsPolicy(BaseModel):
    """Politique complète : une entrée par clé du catalogue (les absentes prennent l'origine)."""
    settings: dict[str, SettingPolicy] = {}

    @model_validator(mode="after")
    def _check(self) -> "SettingsPolicy":
        unknown = set(self.settings) - set(CATALOG)
        if unknown:
            raise ValueError(f"Paramètres inconnus : {sorted(unknown)}")
        full: dict[str, SettingPolicy] = {}
        for key, (_section, kind, options, origin, lockable) in CATALOG.items():
            p = self.settings.get(key) or SettingPolicy(default=origin, options=list(options) if options else None)
            if p.mode != "free" and not lockable:
                raise ValueError(f"{key} : ce paramètre ne peut être que libre.")
            if kind == "bool":
                if not isinstance(p.default, bool):
                    raise ValueError(f"{key} : la valeur par défaut doit être oui ou non.")
                p = SettingPolicy(mode=p.mode, default=p.default, options=None)
            else:
                allowed = list(options)
                chosen = [o for o in (p.options if p.options is not None else allowed) if o in allowed]
                chosen = [o for o in allowed if o in chosen]                 # ordre du catalogue, sans doublon
                if not chosen:
                    raise ValueError(f"{key} : au moins une option doit rester proposée.")
                # themeMode / colorPalette : None = pas de défaut imposé (seulement en mode libre)
                if p.default is None and origin is None and p.mode == "free":
                    pass
                elif p.default not in chosen:
                    raise ValueError(f"{key} : la valeur par défaut doit faire partie des options proposées.")
                p = SettingPolicy(mode=p.mode, default=p.default, options=chosen)
            full[key] = p
        self.settings = full
        return self


def builtin_policy() -> SettingsPolicy:
    return SettingsPolicy()


def catalog_out() -> list[dict]:
    """Description du catalogue pour le dashboard (ordre d'affichage)."""
    return [
        {"key": key, "section": section, "type": kind, "options": options,
         "origin": origin, "lockable": lockable}
        for key, (section, kind, options, origin, lockable) in CATALOG.items()
    ]


# ── Application de la politique ───────────────────────────────────

def _forced(p: SettingPolicy) -> bool:
    return p.mode in ("locked", "hidden")


def effective_value(key: str, stored: Any, policy: SettingsPolicy, *, has_value: bool) -> Any:
    """Valeur qu'a vraiment le joueur pour `key`."""
    p = policy.settings[key]
    if _forced(p) or not has_value:
        return p.default
    if p.options is not None and stored not in p.options:
        return p.default
    return stored


def effective_preferences(stored: dict, base_defaults: dict, policy: SettingsPolicy) -> dict:
    """
    Préférences du joueur après politique. `stored` = ce que le joueur a enregistré,
    `base_defaults` = DEFAULT_PREFERENCES (clés hors catalogue : tutorialSeen, boardSize…).
    """
    out = {**base_defaults, **(stored or {})}
    for key in out.keys() & policy.settings.keys():
        p = policy.settings[key]
        has = key in (stored or {}) and stored[key] is not None
        if key in ("themeMode", "colorPalette") and p.default is None and not has:
            out[key] = None                       # pas de défaut imposé : le client garde le sien
            continue
        out[key] = effective_value(key, (stored or {}).get(key), policy, has_value=has)
    return out


def filter_patch(patch: dict, policy: SettingsPolicy, *, prefix: str = "") -> tuple[dict, list[str]]:
    """
    Retire d'une modification les clés verrouillées/masquées et les valeurs non proposées.
    Retourne (patch accepté, clés refusées). Les clés hors catalogue passent telles quelles.
    """
    accepted, refused = {}, []
    for key, value in patch.items():
        p = policy.settings.get(prefix + key)
        if p is None:
            accepted[key] = value
        elif _forced(p) or (p.options is not None and value not in p.options):
            refused.append(key)
        else:
            accepted[key] = value
    return accepted, refused


def privacy_defaults(policy: SettingsPolicy) -> dict[str, Any]:
    """Valeurs des colonnes privacy_* d'un nouveau compte."""
    return {col: policy.settings[key].default for key, col in PRIVACY_COLUMNS.items()}


def public_policy(policy: SettingsPolicy) -> dict:
    """Ce que reçoivent les clients (pas de secret ici : tout est public)."""
    return {key: p.model_dump() for key, p in policy.settings.items()}
