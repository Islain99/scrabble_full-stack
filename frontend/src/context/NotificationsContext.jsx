// src/context/NotificationsContext.jsx
//
// Notifications du joueur connecté (lot 5) : invitations à jouer, demandes
// d'ami, et avis (demande acceptée, invitation refusée).
//   - en direct : /notifications/{uid} dans la base temps réel (écrit par le serveur) ;
//   - repli : GET /notifications toutes les 15 s (invitations et demandes seulement).
// Actions : accepter / refuser une invitation ou une demande, fermer un avis.
// Accepter une invitation ouvre la partie : on va sur #/multiplayer, et la page
// déjà ouverte est prévenue par l'événement « scrabble:room-joined ».

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getRtdb } from '../firebase';
import * as ns from '../api/notificationsService';
import { acceptRequest, declineRequest } from '../api/friendsService';

const Ctx = createContext(null);
const POLL_MS = 15000;
const RTDB_TIMEOUT_MS = 8000;
export const ROOM_JOINED_EVENT = 'scrabble:room-joined';
/** Une demande d'ami a été acceptée ou refusée depuis la cloche : la page Amis se met à jour. */
export const FRIENDS_CHANGED_EVENT = 'scrabble:friends-changed';
const friendsChanged = () => window.dispatchEvent(new Event(FRIENDS_CHANGED_EVENT));

/** Fiches RTDB { clé: {...} } → liste, la plus récente d'abord. */
function fromNode(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node)
    .filter(([, v]) => v && typeof v === 'object' && v.type)
    .map(([key, v]) => ({ key, ...v, created_at: Number(v.created_at) || 0 }))
    .sort((a, b) => b.created_at - a.created_at);
}

function fromRest(list) {
  return (list ?? []).map(n => ({
    ...n,
    created_at: n.created_at ? Date.parse(n.created_at) : 0,
    turn_seconds: n.settings?.turn_seconds,
    target_score: n.settings?.target_score,
    allow_swap: n.settings?.allow_swap,
  }));
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.firebase_uid ?? null;
  const [state, setState] = useState({ uid: null, items: [], live: false });
  const [hidden, setHidden] = useState({});        // clés retirées localement (réponse en cours)
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    let unsubscribe = null;
    let pollTimer = null;
    let gotEvent = false;

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      const poll = async () => {
        try {
          const list = await ns.listNotifications();
          if (!cancelled) setState(prev => ({ uid, items: fromRest(list), live: prev.uid === uid && prev.live }));
        } catch { /* silencieux */ }
      };
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    };
    const watchdog = setTimeout(() => { if (!gotEvent) startPolling(); }, RTDB_TIMEOUT_MS);

    getRtdb()
      .then(({ db, ref, onValue }) => {
        if (cancelled) return;
        unsubscribe = onValue(
          ref(db, `/notifications/${uid}`),
          (snap) => {
            gotEvent = true;
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            setState({ uid, items: fromNode(snap.val()), live: true });
          },
          () => { unsubscribe = null; startPolling(); },
        );
      })
      .catch(() => startPolling());

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubscribe?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [uid]);

  const items = useMemo(
    () => (state.uid === uid ? state.items : []).filter(n => !hidden[n.key]),
    [state, uid, hidden],
  );

  const hide = useCallback((key) => setHidden(h => ({ ...h, [key]: true })), []);
  const unhide = useCallback((key) => setHidden(h => { const next = { ...h }; delete next[key]; return next; }), []);

  const run = useCallback(async (key, fn) => {
    setError(null);
    hide(key);
    try {
      return await fn();
    } catch (err) {
      unhide(key);
      setError(err?.response?.data?.detail || 'error');
      return null;
    }
  }, [hide, unhide]);

  const acceptInvite = useCallback((n) => run(n.key, async () => {
    const room = await ns.acceptInvitation(n.invitation_id);
    window.dispatchEvent(new CustomEvent(ROOM_JOINED_EVENT, { detail: room }));
    if (!(window.location.hash || '').startsWith('#/multiplayer')) window.location.hash = '#/multiplayer';
    return room;
  }), [run]);
  const declineInvite = useCallback((n) => run(n.key, () => ns.declineInvitation(n.invitation_id)), [run]);
  const acceptFriend  = useCallback((n) => run(n.key, async () => { await acceptRequest(n.request_id); friendsChanged(); }), [run]);
  const declineFriend = useCallback((n) => run(n.key, async () => { await declineRequest(n.request_id); friendsChanged(); }), [run]);
  const dismiss       = useCallback((n) => run(n.key, () => ns.dismissNotification(n.key)), [run]);

  const value = useMemo(() => ({
    items, count: items.length, live: state.live, error, clearError: () => setError(null),
    acceptInvite, declineInvite, acceptFriend, declineFriend, dismiss,
  }), [items, state.live, error, acceptInvite, declineInvite, acceptFriend, declineFriend, dismiss]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Notifications (liste vide hors connexion ou sans fournisseur). */
export function useNotifications() {
  return useContext(Ctx) ?? {
    items: [], count: 0, live: false, error: null, clearError: () => {},
    acceptInvite: async () => null, declineInvite: async () => null,
    acceptFriend: async () => null, declineFriend: async () => null, dismiss: async () => null,
  };
}
