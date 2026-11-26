# app/appconfig/service.py
#
# Lecture / écriture de la configuration globale, avec un petit cache en mémoire :
# la politique des paramètres est lue à chaque chargement de préférences, elle ne
# doit pas coûter une requête à chaque fois. Le cache expire au bout de TTL_S
# secondes (plusieurs processus finissent ainsi par voir la même version) et il est
# vidé dès qu'un administrateur enregistre.
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.appconfig.catalog import PRIVACY_COLUMNS, SettingsPolicy, builtin_policy
from app.appconfig.models import AppConfig

logger = logging.getLogger(__name__)

TTL_S = 30
SETTINGS_KEY = "settings"
PRIVACY_KEY = "privacy_policy"

_cache: dict[str, tuple[float, Optional[AppConfig]]] = {}
_last_policy: SettingsPolicy = builtin_policy()


def invalidate() -> None:
    global _last_policy
    _cache.clear()
    _last_policy = builtin_policy()


async def get_row(db: AsyncSession, key: str) -> Optional[AppConfig]:
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < TTL_S:
        return hit[1]
    try:
        # Point de sauvegarde : si la table manque (base pas encore migrée), seule
        # cette lecture est annulée, pas la transaction de la requête en cours.
        async with db.begin_nested():
            row = await db.get(AppConfig, key)
    except Exception as exc:
        logger.warning("app_config illisible (%s) : valeurs d'origine utilisées.", exc)
        row = None
    if row is not None:
        db.expunge(row)                           # gardé en cache hors de la session
    _cache[key] = (time.monotonic(), row)
    return row


async def get_policy(db: AsyncSession) -> SettingsPolicy:
    """Politique à jour (au plus TTL_S secondes de retard)."""
    global _last_policy
    row = await get_row(db, SETTINGS_KEY)
    policy = builtin_policy()
    if row is not None:
        try:
            policy = SettingsPolicy.model_validate(row.value)
        except Exception as exc:                  # document abîmé : on n'empêche pas de jouer
            logger.error("Politique des paramètres invalide en base : %s", exc)
    _last_policy = policy
    return policy


def cached_policy() -> SettingsPolicy:
    """Dernière politique connue (synchrone : modèles, notifications push)."""
    return _last_policy


async def save(db: AsyncSession, key: str, value: dict[str, Any], admin_id: Optional[int]) -> AppConfig:
    row = await db.get(AppConfig, key)
    if row is None:
        row = AppConfig(key=key, value=value, updated_by=admin_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = admin_id
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(row, "value")
    await db.flush()
    invalidate()
    return row


async def delete(db: AsyncSession, key: str) -> bool:
    row = await db.get(AppConfig, key)
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    invalidate()
    return True


async def enforce_privacy(db: AsyncSession, policy: SettingsPolicy) -> dict[str, int]:
    """
    Confidentialité verrouillée, masquée ou option retirée : les colonnes des joueurs
    concernés reprennent la valeur par défaut. Écrit en base, la règle vaut pour
    toutes les routes qui lisent ces colonnes (profil, recherche, classements…).
    Retourne le nombre de comptes modifiés par paramètre.
    """
    from app.db.models import User
    changed: dict[str, int] = {}
    for key, col in PRIVACY_COLUMNS.items():
        p = policy.settings[key]
        column = getattr(User, col)
        if p.mode in ("locked", "hidden"):
            cond = column != p.default
        elif p.options is not None:
            cond = column.notin_(p.options)
        else:
            continue
        result = await db.execute(update(User).where(cond).values({col: p.default}))
        if result.rowcount:
            changed[key] = result.rowcount
    return changed
