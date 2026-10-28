// src/hooks/usePublicRooms.js
//
// Salons publics (P1) : salles publiques en attente d'un adversaire.
//   - en direct : écoute /lobby dans Firebase RTDB (fiches écrites par le
//     serveur uniquement, lisibles par tout joueur connecté) ;
//   - repli : GET /multiplayer/rooms/public toutes les 10 s si la base temps
//     réel est indisponible, refusée ou muette après 8 s.
// Les salles sont rendues sous la forme { room_id, host_name, settings, created_at (ms) },
// les plus récentes d'abord, 50 au plus.

import { useEffect, useState } from 'react';
import { getRtdb } from '../firebase';
import * as mpService from '../api/multiplayerService';

const LIMIT = 50;
const POLL_MS = 10000;
const RTDB_TIMEOUT_MS = 8000;

/** Fiches RTDB { CODE: { host_name, created_at, turn_seconds, … } } → liste triée. */
function fromLobbyNode(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node)
    .filter(([, e]) => e && typeof e === 'object')
    .map(([room_id, e]) => ({
      room_id,
      host_name: e.host_name ?? '',
      created_at: Number(e.created_at) || 0,
      settings: {
        name: e.name ?? null,
        turn_seconds: e.turn_seconds ?? 0,
        allow_swap: e.allow_swap ?? true,
        show_preview: e.show_preview ?? true,
        max_passes: e.max_passes ?? 6,
        target_score: e.target_score ?? null,
      },
    }));
}

function fromRest(rooms) {
  return (rooms ?? []).map(r => ({
    room_id: r.room_id,
    host_name: r.host_name,
    created_at: r.created_at ? Date.parse(r.created_at) : 0,
    settings: r.settings,
    is_mine: !!r.is_mine,
  }));
}

const sortAndLimit = (list) => [...list].sort((a, b) => b.created_at - a.created_at).slice(0, LIMIT);

/**
 * @param {boolean} enabled  écoute seulement quand le lobby est affiché
 * @returns {{ rooms: Array|null, live: boolean }}  rooms = null tant que rien n'est arrivé
 */
export function usePublicRooms(enabled = true) {
  const [state, setState] = useState({ rooms: null, live: false });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let unsubscribe = null;
    let pollTimer = null;
    let gotEvent = false;

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      const poll = async () => {
        try {
          const rooms = await mpService.listPublicRooms();
          if (!cancelled) setState({ rooms: sortAndLimit(fromRest(rooms)), live: false });
        } catch {
          // silencieux : la liste reste celle d'avant
        }
      };
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    };

    const watchdog = setTimeout(() => { if (!gotEvent) startPolling(); }, RTDB_TIMEOUT_MS);

    getRtdb()
      .then(({ db, ref, onValue }) => {
        if (cancelled) return;
        unsubscribe = onValue(
          ref(db, '/lobby'),
          (snapshot) => {
            gotEvent = true;
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            setState({ rooms: sortAndLimit(fromLobbyNode(snapshot.val())), live: true });
          },
          () => { unsubscribe = null; startPolling(); },   // lecture refusée, connexion perdue
        );
      })
      .catch(() => startPolling());

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubscribe?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [enabled]);

  return state;
}
