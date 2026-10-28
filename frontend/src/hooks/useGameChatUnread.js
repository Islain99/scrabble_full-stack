// src/hooks/useGameChatUnread.js
// Non-lus du chat de la partie (lot 6), lus dans la boîte de réception temps réel.
import { useNotifications } from '../context/NotificationsContext';

export function useGameChatUnread(roomId) {
  const { inbox } = useNotifications();
  if (!roomId) return 0;
  const entry = Object.values(inbox).find(e => e?.kind === 'game' && e.title === `Partie ${roomId}`);
  return entry && !entry.muted ? Number(entry.unread) || 0 : 0;
}
