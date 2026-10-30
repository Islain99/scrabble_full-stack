# app/push/service.py
#
# Envoi des notifications push (lot 7) par Firebase Cloud Messaging.
#
#   - Envoi en tâche de fond : la requête du joueur n'attend jamais Firebase.
#   - Le serveur relit les jetons et les préférences du destinataire (Paramètres →
#     Notifications) dans sa propre session : rien ne dépend de la transaction
#     de la requête.
#   - Navigateur : message « data » seulement, affiché par notre service worker
#     (public/push-sw.js) sauf si l'onglet est déjà au premier plan.
#     Android / iOS : message « notification » affiché par le système.
#   - Jeton périmé (appareil réinitialisé, permission retirée) : supprimé.
#   - Anti-rafale : une seule notification par conversation par minute, par
#     partie toutes les 2 minutes, pour un même joueur.
from __future__ import annotations

import asyncio
import logging
import time
from typing import Iterable, Optional

from sqlalchemy import delete, select

from app.db import database
from app.db.models import User
from app.push.messages import render
from app.push.models import PushToken

logger = logging.getLogger(__name__)

# Catégorie → préférence (game_preferences) qui permet de la couper
CATEGORY_PREF = {
    "invites":  "pushInvites",
    "friends":  "pushFriends",
    "messages": "pushMessages",
    "turn":     "pushTurn",
    "system":   None,               # notification de test : toujours envoyée
}

THROTTLE_S = {"messages": 60, "turn": 120}
_recent: dict[tuple[str, str], float] = {}
_tasks: set[asyncio.Task] = set()


def _throttled(category: str, uid: str, tag: Optional[str]) -> bool:
    window = THROTTLE_S.get(category)
    if not window or not tag:
        return False
    now = time.monotonic()
    key = (uid, tag)
    if now - _recent.get(key, -1e9) < window:
        return True
    _recent[key] = now
    if len(_recent) > 10000:
        for k in [k for k, t in _recent.items() if now - t > 600]:
            _recent.pop(k, None)
    return False


# ── Envoi Firebase (synchrone, dans un thread) ────────────────────

def _send(messages: list[dict]) -> list[str]:
    """
    Envoie [{token, platform, title, body, data, tag}] ; retourne les jetons à supprimer.
    Sans Firebase configuré (développement, tests), n'envoie rien.
    """
    try:
        from firebase_admin import messaging
    except Exception:
        return []

    built = []
    for m in messages:
        data = {k: str(v) for k, v in {**m["data"], "title": m["title"], "body": m["body"], "tag": m["tag"] or ""}.items()}
        if m["platform"] == "web":
            built.append(messaging.Message(
                token=m["token"], data=data,
                webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "3600"}),
            ))
        else:
            built.append(messaging.Message(
                token=m["token"], data=data,
                notification=messaging.Notification(title=m["title"], body=m["body"]),
                android=messaging.AndroidConfig(
                    priority="high", ttl=3600,
                    collapse_key=m["tag"] or None,
                    notification=messaging.AndroidNotification(tag=m["tag"] or None),
                ),
                apns=messaging.APNSConfig(payload=messaging.APNSPayload(
                    aps=messaging.Aps(thread_id=m["tag"] or None, sound="default"))),
            ))
    stale = []
    for start in range(0, len(built), 500):
        chunk = built[start:start + 500]
        try:
            batch = messaging.send_each(chunk)
        except Exception as exc:
            logger.warning("Push : envoi impossible : %s", exc)
            continue
        for msg, resp in zip(messages[start:start + 500], batch.responses):
            if resp.success:
                continue
            exc = resp.exception
            name = type(exc).__name__ if exc else ""
            if name in ("UnregisteredError", "SenderIdMismatchError") or (
                    name == "InvalidArgumentError" and "token" in str(exc).lower()):
                stale.append(msg["token"])
            else:
                logger.info("Push : refusé (%s) : %s", name, exc)
    return stale


# ── Livraison ─────────────────────────────────────────────────────

async def _deliver(uids: list[str], category: str, kind: str, params: dict,
                   url: str, tag: Optional[str], per_uid: Optional[dict] = None) -> int:
    factory = database.AsyncSessionLocal
    if factory is None or not uids:
        return 0
    pref_key = CATEGORY_PREF.get(category)
    async with factory() as session:
        rows = (await session.execute(
            select(PushToken, User.firebase_uid, User.game_preferences)
            .join(User, User.id == PushToken.user_id)
            .where(User.firebase_uid.in_(uids), User.is_active == True)  # noqa: E712
        )).all()
        messages = []
        for token, uid, prefs in rows:
            if pref_key and (prefs or {}).get(pref_key) is False:
                continue
            p = {**params, **((per_uid or {}).get(uid) or {})}
            title, body = render(p.pop("_kind", kind), token.locale, p)
            messages.append({
                "token": token.token, "platform": token.platform, "title": title, "body": body,
                "tag": tag, "data": {"url": url, "category": category},
            })
        if not messages:
            return 0
        stale = await asyncio.to_thread(_send, messages)
        if stale:
            await session.execute(delete(PushToken).where(PushToken.token.in_(stale)))
            await session.commit()
            logger.info("Push : %d jeton(s) périmé(s) supprimé(s)", len(stale))
        return len(messages) - len(stale)


def _enabled() -> bool:
    """Firebase initialisé (sinon : développement local, tests → rien à envoyer)."""
    try:
        import firebase_admin
        firebase_admin.get_app()
        return True
    except Exception:
        return False


def push(uids: Iterable[Optional[str]], category: str, kind: str, params: Optional[dict] = None,
         url: str = "#/", tag: Optional[str] = None, per_uid: Optional[dict] = None) -> None:
    """Planifie une notification (sans attendre). uids : identifiants Firebase des destinataires."""
    if not _enabled():
        return
    targets = [u for u in dict.fromkeys(uids) if u and not _throttled(category, u, tag)]
    if not targets:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(_safe_deliver(targets, category, kind, params or {}, url, tag, per_uid))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _safe_deliver(*args) -> None:
    try:
        await _deliver(*args)
    except Exception as exc:          # une notification ratée ne doit rien casser
        logger.warning("Push : livraison en échec : %s", exc)


async def drain() -> None:
    """Attend les envois en cours (tests, arrêt de l'application)."""
    while _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


# ── Événements de l'application ───────────────────────────────────

_NOTIFY_KINDS = {
    "inv-": ("invites", "game_invite", "#/multiplayer"),
    "fr-":  ("friends", "friend_request", "#/friends"),
    "fra-": ("friends", "friend_accepted", "#/friends"),
}


def from_notification(uid: Optional[str], key: str, payload: Optional[dict]) -> None:
    """Appelé par notifications.service.notify : invitations et demandes d'ami."""
    if not uid or payload is None:
        return
    prefix = key.split("-", 1)[0] + "-"
    spec = _NOTIFY_KINDS.get(prefix)
    if spec is None:
        return
    category, kind, url = spec
    push([uid], category, kind, {"name": payload.get("from_name", "")}, url=url, tag=key)


def new_message(conv_id: int, recipients: list[tuple[str, str]], author_name: str, body: str) -> None:
    """Message privé ou de groupe. recipients : [(uid, titre de la conversation pour lui)]."""
    text = " ".join(body.split())
    preview = text[:120] + ("…" if len(text) > 120 else "")
    per_uid = {}
    for uid, title in recipients:
        is_private = title == author_name
        per_uid[uid] = {"title": title or author_name,
                        "preview": preview if is_private else f"{author_name} : {preview}"}
    push([uid for uid, _ in recipients], "messages", "message", {}, url=f"#/messages?c={conv_id}",
         tag=f"conv-{conv_id}", per_uid=per_uid)


def game_update(room_id: str, players: dict, gs_dict: Optional[dict], event: str = "move") -> None:
    """
    Partie multijoueur : « à toi de jouer » au joueur dont c'est le tour, résultat
    aux deux joueurs en fin de partie, « la partie commence » à l'hôte.
    players : {"host": uid, "guest": uid} ; gs_dict : état complet (serveur).
    """
    if not gs_dict:
        return
    names = [p.get("name", "") for p in (gs_dict.get("players") or [])]
    scores = [int(p.get("score", 0)) for p in (gs_dict.get("players") or [])]
    if len(names) < 2:
        return
    uids = [players.get("host"), players.get("guest")]
    url = "#/multiplayer"
    if gs_dict.get("status") == "FINISHED":
        winner = gs_dict.get("winner_id")
        ids = [p.get("id") for p in gs_dict["players"]]
        per_uid = {}
        for i, uid in enumerate(uids):
            if not uid:
                continue
            kind = "game_draw" if winner is None or gs_dict.get("is_draw") else (
                "game_won" if winner == ids[i] else "game_lost")
            per_uid[uid] = {"_kind": kind, "name": names[1 - i], "me": scores[i], "them": scores[1 - i]}
        # Fin de partie : pas d'anti-rafale (une seule par partie), étiquette distincte
        push([u for u in uids if u], "turn", "game_draw", {}, url=url, tag=f"end-{room_id}", per_uid=per_uid)
        return
    if event == "start":                 # l'invité vient d'arriver : on prévient l'hôte
        if uids[0]:
            push([uids[0]], "turn", "game_started", {"name": names[1]}, url=url, tag=f"start-{room_id}")
        return
    idx = int(gs_dict.get("current_player_index", 0) or 0)
    if idx not in (0, 1) or not uids[idx]:
        return
    push([uids[idx]], "turn", "your_turn", {"name": names[1 - idx]}, url=url, tag=f"turn-{room_id}")
