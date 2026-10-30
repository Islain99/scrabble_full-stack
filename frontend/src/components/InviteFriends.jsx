// src/components/InviteFriends.jsx
//
// Lot 5, salle d'attente de l'hôte :
//   - InvitationsStatus : suivi des invitations envoyées (en attente, refusée…) ;
//   - InviteFriendsModal : choisir des amis à inviter dans cette salle.
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getFriendsList } from '../api/friendsService';
import { inviteFriend, roomInvitations } from '../api/notificationsService';
import { useFriendsPresence } from '../hooks/useFriendsPresence';
import { RetroButton, Spinner } from './ui';

const POLL_MS = 4000;

/** Invitations de la salle, relues toutes les 4 s ; `refreshKey` force une relecture. */
export function InvitationsStatus({ roomId, refreshKey = 0 }) {
  const { t } = useLanguage();
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!roomId) return undefined;
    let cancelled = false;
    const load = () => roomInvitations(roomId)
      .then(l => { if (!cancelled) setList(l); })
      .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomId, refreshKey]);

  if (list.length === 0) return null;
  const label = { pending: t('iv_pending'), declined: t('iv_declined'), accepted: t('iv_accepted'), expired: t('iv_expired') };
  return (
    <ul className="iv-status" aria-label={t('iv_title')}>
      {list.map(inv => (
        <li key={inv.invitation_id} className={`iv-row iv-row--${inv.status}`}>
          <span className="fr-name">{inv.invitee_name}</span>
          <span className="pr-tag">{label[inv.status] ?? inv.status}</span>
        </li>
      ))}
    </ul>
  );
}

export function InviteFriendsModal({ open, onClose, onInvited }) {
  const { t } = useLanguage();
  const [friends, setFriends] = useState(null);
  const [sent, setSent] = useState({});
  const [error, setError] = useState(null);
  const presence = useFriendsPresence(open ? friends?.map(f => f.firebase_uid) : null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    getFriendsList().then(list => { if (!cancelled) setFriends(list); }).catch(() => { if (!cancelled) setFriends([]); });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const invite = async (f) => {
    setError(null);
    try {
      await inviteFriend(f.user_id);
      setSent(s => ({ ...s, [f.user_id]: true }));
      onInvited?.();
    } catch (err) {
      setError(err?.response?.data?.detail || t('fr_error'));
    }
  };
  const rank = { playing: 1, online: 0, offline: 2 };
  const sorted = [...(friends ?? [])].sort((a, b) =>
    (rank[presence[a.firebase_uid]?.state] ?? 2) - (rank[presence[b.firebase_uid]?.state] ?? 2));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="iv-title" className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <h2 id="iv-title" className="mh-title">{t('iv_invite_friends')}</h2>
        {error && <p className="rr-blocked" role="alert">{error}</p>}
        <div className="rr-body">
          {friends === null ? <Spinner size="sm" /> : sorted.length === 0 ? <p className="pr-empty">{t('fr_empty')}</p> : (
            <ul className="fr-list">
              {sorted.map(f => {
                const state = presence[f.firebase_uid]?.state ?? 'offline';
                return (
                  <li key={f.user_id} className="fr-row">
                    <span className="fr-avatar-wrap">
                      <span className="fr-avatar" aria-hidden="true">{f.display_name.slice(0, 1).toUpperCase()}</span>
                      <span className={`fr-dot fr-dot--${state}`} aria-hidden="true" />
                    </span>
                    <span className="fr-main">
                      <span className="fr-name">{f.display_name}</span>
                      <span className={`fr-meta fr-status--${state}`}>
                        {state === 'playing' ? t('fr_playing') : state === 'online' ? t('fr_online') : t('fr_offline')}
                      </span>
                    </span>
                    {sent[f.user_id]
                      ? <span className="pr-tag">✓ {t('iv_pending')}</span>
                      : <RetroButton variant="primary" onClick={() => invite(f)}>{t('iv_invite')}</RetroButton>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="rr-actions">
          <RetroButton variant="primary" onClick={onClose}>{t('mh_close')}</RetroButton>
        </div>
      </div>
    </div>
  );
}
