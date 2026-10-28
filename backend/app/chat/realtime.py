# app/chat/realtime.py
#
# Diffusion en direct de la messagerie (lot 6) — seul le serveur écrit :
#   /chat/{clé}/members/{uid}: true   qui peut lire (règles Firebase) ; pas pour « global »
#   /chat/{clé}/messages/{id}         les 100 derniers messages
#   /inbox/{uid}/{id_conversation}    aperçu, date, non-lus (badge de la barre de navigation)
# clé = « global » pour le salon universel, sinon l'identifiant de la conversation.
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

LIVE_MESSAGES = 100


def rtdb_key(conversation) -> str:
    return "global" if conversation.kind == "global" else str(conversation.id)


def _write(path: str, value) -> None:
    """set(value), ou suppression si value est None (synchrone, erreurs ignorées)."""
    try:
        from firebase_admin import db as rtdb
        node = rtdb.reference(path)
        if value is None:
            node.delete()
        else:
            node.set(value)
    except Exception as exc:
        logger.warning("Messagerie : écriture RTDB ignorée (%s) : %s", path, exc)


def _update(path: str, values: dict) -> None:
    try:
        from firebase_admin import db as rtdb
        rtdb.reference(path).update(values)
    except Exception as exc:
        logger.warning("Messagerie : mise à jour RTDB ignorée (%s) : %s", path, exc)


def set_members(key: str, uids: list[str]) -> None:
    _write(f"/chat/{key}/members", {uid: True for uid in uids} or None)


def push_message(key: str, message: dict, drop_id: Optional[int] = None) -> None:
    """Publie un message ; retire le plus ancien au-delà des 100 derniers (drop_id)."""
    _write(f"/chat/{key}/messages/{message['id']}", {k: v for k, v in message.items() if v is not None})
    if drop_id is not None:
        _write(f"/chat/{key}/messages/{drop_id}", None)


def mark_deleted(key: str, message_id: int) -> None:
    _update(f"/chat/{key}/messages/{message_id}", {"deleted": True, "body": ""})


def set_inbox(uid: str, conversation_id: int, entry: Optional[dict]) -> None:
    value = None if entry is None else {k: v for k, v in entry.items() if v is not None}
    _write(f"/inbox/{uid}/{conversation_id}", value)


def drop_conversation(key: str) -> None:
    _write(f"/chat/{key}", None)
