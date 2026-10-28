// src/components/Notifications.jsx
//
// Lot 5 :
//   - NotificationBell : cloche de la barre de navigation, avec le nombre de
//     notifications et leur liste (invitations, demandes d'ami, avis) ;
//   - InviteBanner : bandeau qui s'affiche quand une invitation à jouer arrive.
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationsContext';
import { formatTurn } from '../utils/roomRules';
import { RetroButton } from './ui';

function inviteRules(n, t) {
  const parts = [n.turn_seconds ? `⏱ ${formatTurn(n.turn_seconds, t)}` : t('pr_no_timer')];
  if (n.allow_swap === false) parts.push(t('pr_no_swap'));
  if (n.target_score) parts.push(`${n.target_score} pts`);
  return parts.join(' · ');
}

function NotificationItem({ n, compact = false }) {
  const { t } = useLanguage();
  const nc = useNotifications();
  const btn = compact ? { padding: '6px 10px', fontSize: '0.7rem' } : undefined;

  if (n.type === 'game_invite') {
    return (
      <div className="nt-item nt-item--invite">
        <div className="nt-text">
          <strong>{t('nt_invite', { name: n.from_name })}</strong>
          <span className="nt-sub">{inviteRules(n, t)}</span>
        </div>
        <div className="nt-actions">
          <RetroButton variant="primary" style={btn} onClick={() => nc.acceptInvite(n)}>{t('nt_join')}</RetroButton>
          <RetroButton variant="default" style={btn} onClick={() => nc.declineInvite(n)}>{t('fr_decline')}</RetroButton>
        </div>
      </div>
    );
  }
  if (n.type === 'friend_request') {
    return (
      <div className="nt-item">
        <div className="nt-text"><strong>{t('nt_friend_request', { name: n.from_name })}</strong></div>
        <div className="nt-actions">
          <RetroButton variant="primary" style={btn} onClick={() => nc.acceptFriend(n)}>{t('fr_accept')}</RetroButton>
          <RetroButton variant="default" style={btn} onClick={() => nc.declineFriend(n)}>{t('fr_decline')}</RetroButton>
        </div>
      </div>
    );
  }
  const text = n.type === 'friend_accepted'
    ? t('nt_friend_accepted', { name: n.from_name })
    : n.type === 'invite_declined' ? t('nt_invite_declined', { name: n.from_name }) : n.type;
  return (
    <div className="nt-item nt-item--info">
      <div className="nt-text">{text}</div>
      <button type="button" className="fr-icon-btn" aria-label={t('mh_close')} onClick={() => nc.dismiss(n)}>✕</button>
    </div>
  );
}

export function NotificationBell({ variant = 'desktop' }) {
  const { t } = useLanguage();
  const nc = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('hashchange', close);
    };
  }, [open]);

  return (
    <div className={`nt-bell nt-bell--${variant}`} ref={wrapRef}>
      <button
        type="button"
        className="nt-bell-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={nc.count ? t('nt_title_count', { count: nc.count }) : t('nt_title')}
        onClick={() => { setOpen(o => !o); nc.clearError(); }}
      >
        <span aria-hidden="true">🔔</span>
        {nc.count > 0 && <span className="nt-badge" data-testid="nt-badge">{nc.count > 9 ? '9+' : nc.count}</span>}
      </button>
      {open && (
        <div className="nt-panel" role="dialog" aria-label={t('nt_title')}>
          <div className="nt-panel-title">{t('nt_title')}</div>
          {nc.error && <p className="rr-blocked" role="alert">{nc.error === 'error' ? t('fr_error') : nc.error}</p>}
          {nc.items.length === 0
            ? <p className="nt-empty">{t('nt_empty')}</p>
            : nc.items.map(n => <NotificationItem key={n.key} n={n} compact />)}
        </div>
      )}
    </div>
  );
}

/** Bandeau : dernière invitation reçue, tant qu'on ne l'a pas mise de côté. */
export function InviteBanner() {
  const { t } = useLanguage();
  const nc = useNotifications();
  const [setAside, setSetAside] = useState({});
  const invite = nc.items.find(n => n.type === 'game_invite' && !setAside[n.key]);
  if (!invite) return null;
  return (
    <div className="nt-banner" role="status" aria-live="polite" data-testid="invite-banner">
      <NotificationItem n={invite} />
      <button
        type="button"
        className="nt-banner-later"
        onClick={() => setSetAside(s => ({ ...s, [invite.key]: true }))}
      >
        {t('nt_later')}
      </button>
      {nc.error && <p className="rr-blocked" role="alert">{nc.error === 'error' ? t('fr_error') : nc.error}</p>}
    </div>
  );
}
