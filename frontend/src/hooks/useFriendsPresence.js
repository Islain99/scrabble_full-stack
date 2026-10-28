// src/hooks/useFriendsPresence.js
//
// Présence des amis (lot 4) : écoute /presence/{uid} de chaque ami.
// Les règles Firebase ne l'autorisent que si le serveur a recopié l'amitié
// dans /friends/{uid} ; sinon la lecture échoue et l'ami paraît hors ligne.
// Renvoie { [uid]: { state, last_active } }.

import { useEffect, useState } from 'react';
import { getRtdb } from '../firebase';

export function useFriendsPresence(uids) {
  const key = [...(uids ?? [])].sort().join(',');
  const [presence, setPresence] = useState({});

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) return undefined;
    let cancelled = false;
    const stops = [];
    getRtdb()
      .then(({ db, ref, onValue }) => {
        if (cancelled) return;
        list.forEach((uid) => {
          stops.push(onValue(
            ref(db, `/presence/${uid}`),
            (snap) => {
              const v = snap.val();
              setPresence(prev => ({ ...prev, [uid]: v && typeof v === 'object' ? v : null }));
            },
            () => setPresence(prev => ({ ...prev, [uid]: null })),
          ));
        });
      })
      .catch(() => { /* hors ligne pour tous */ });
    return () => { cancelled = true; stops.forEach(stop => stop?.()); };
  }, [key]);

  return presence;
}
