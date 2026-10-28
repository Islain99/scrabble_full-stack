# app/chat/cleanup.py
#
# Nettoyage de la messagerie (lot 6), une fois par heure :
#   - salon universel : messages de plus de 30 jours supprimés ;
#   - chat de partie : supprimé avec sa salle (les salles terminées partent après 30 jours).
# Au mieux : une erreur est journalisée, jamais propagée.
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, select

from app.chat import realtime
from app.chat.models import Conversation, ConversationKind, ConversationMember, Message
from app.db import database as db
from app.db.models import User
from app.multiplayer.models import MultiplayerGame

logger = logging.getLogger(__name__)

GLOBAL_RETENTION = timedelta(days=30)
CLEANUP_INTERVAL_S = 60 * 60


async def cleanup_chat(now: Optional[datetime] = None) -> dict:
    counts = {"global_messages": 0, "game_conversations": 0}
    if db.AsyncSessionLocal is None:
        return counts
    now = now or datetime.now(timezone.utc)
    rtdb_drop: list[str] = []
    inbox_drop: list[tuple[str, int]] = []

    async with db.AsyncSessionLocal() as session:
        async with session.begin():
            glob_ids = select(Conversation.id).where(Conversation.kind == ConversationKind.GLOBAL)
            result = await session.execute(delete(Message).where(
                Message.conversation_id.in_(glob_ids), Message.created_at < now - GLOBAL_RETENTION))
            counts["global_messages"] = result.rowcount or 0

            orphans = (await session.execute(
                select(Conversation).where(
                    Conversation.kind == ConversationKind.GAME,
                    ~Conversation.room_id.in_(select(MultiplayerGame.room_id)),
                )
            )).scalars().all()
            for conv in orphans:
                for uid in (await session.execute(
                    select(User.firebase_uid).join(ConversationMember, ConversationMember.user_id == User.id)
                    .where(ConversationMember.conversation_id == conv.id))).scalars().all():
                    inbox_drop.append((uid, conv.id))
                await session.execute(delete(Message).where(Message.conversation_id == conv.id))
                await session.execute(delete(ConversationMember).where(ConversationMember.conversation_id == conv.id))
                rtdb_drop.append(realtime.rtdb_key(conv))
                await session.delete(conv)
            counts["game_conversations"] = len(orphans)

    for key in rtdb_drop:
        await asyncio.to_thread(realtime.drop_conversation, key)
    for uid, conv_id in inbox_drop:
        await asyncio.to_thread(realtime.set_inbox, uid, conv_id, None)
    if any(counts.values()):
        logger.info("Nettoyage messagerie : %s", counts)
    return counts


async def run_chat_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_S)
        try:
            await cleanup_chat()
        except Exception as exc:
            logger.warning("Nettoyage messagerie en échec : %s", exc)
