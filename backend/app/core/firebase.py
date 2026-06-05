# app/core/firebase.py
import json
import logging
import os

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_initialized = False


def init_firebase() -> bool:
    """
    Initialise Firebase Admin SDK.
    Retourne True si initialisé, False si les credentials sont absents
    (permet de démarrer sans Firebase en dev local).
    """
    global _initialized
    if _initialized:
        return True

    settings = get_settings()

    try:
        # Priorité 1 : JSON inline (Railway — variable d'env)
        if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
            cred_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
            cred = credentials.Certificate(cred_dict)

        # Priorité 2 : fichier local (développement)
        elif os.path.exists(settings.FIREBASE_SERVICE_ACCOUNT_PATH):
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)

        else:
            logger.warning(
                "Firebase non configuré — les routes /auth/* seront inactives. "
                "Définissez FIREBASE_SERVICE_ACCOUNT_JSON dans Railway "
                "ou FIREBASE_SERVICE_ACCOUNT_PATH en local."
            )
            return False

        firebase_admin.initialize_app(cred)
        _initialized = True
        logger.info("Firebase Admin SDK initialisé.")
        return True

    except Exception as exc:
        logger.error("Erreur Firebase : %s", exc)
        return False


def verify_firebase_token(id_token: str) -> dict:
    """Vérifie un token Firebase ID. Lève une exception si invalide."""
    if not _initialized:
        raise RuntimeError("Firebase non initialisé.")
    return firebase_auth.verify_id_token(id_token)


def is_firebase_ready() -> bool:
    return _initialized