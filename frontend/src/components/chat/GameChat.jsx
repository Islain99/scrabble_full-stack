// src/components/chat/GameChat.jsx
//
// Chat de la partie (lot 6) : tiroir latéral (ordinateur) ou plein écran
// (téléphone) avec le fil de la conversation des deux joueurs.
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { gameConversation } from '../../api/chatService';
import ChatThread from './ChatThread';
import { Spinner } from '../ui';

export default function GameChat({ roomId, open, onClose }) {
  const { t } = useLanguage();
  const [conv, setConv] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !roomId) return undefined;
    let cancelled = false;
    gameConversation(roomId)
      .then(c => { if (!cancelled) setConv(c); })
      .catch(err => { if (!cancelled) setError(err?.response?.data?.detail || t('fr_error')); });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.removeEventListener('keydown', onKey); };
  }, [open, roomId, onClose, t]);

  if (!open) return null;
  return (
    <div className="gc-backdrop" onClick={onClose}>
      <aside className="gc-drawer" role="dialog" aria-modal="true" aria-label={t('msg_game_chat')} onClick={e => e.stopPropagation()}>
        <button type="button" className="gc-close" aria-label={t('mh_close')} onClick={onClose}>✕</button>
        {error ? <p className="rr-blocked">{error}</p>
          : conv ? <ChatThread key={conv.id} conversation={conv} compact />
            : <div className="ch-center"><Spinner size="sm" /></div>}
      </aside>
    </div>
  );
}
