// src/utils/presence.js
//
// Présence en ligne (lot 4) : chaque joueur connecté écrit /presence/{uid}
//   { state: 'online' | 'playing' | 'offline', last_active: <heure du serveur> }
// Firebase repasse l'état à « offline » tout seul à la déconnexion
// (onDisconnect). C'est la seule écriture du navigateur dans la base temps
// réel ; les règles la limitent à son propre uid. Seuls les amis peuvent lire
// (le serveur recopie la liste d'amis dans /friends/{uid}).

import { getRtdb } from '../firebase';

let current = { uid: null, activity: 'online' };
let pending = Promise.resolve();

async function write(uid, state) {
  try {
    const { db, ref, set, onDisconnect, serverTimestamp } = await getRtdb();
    const node = ref(db, `/presence/${uid}`);
    if (state !== 'offline') {
      await onDisconnect(node).set({ state: 'offline', last_active: serverTimestamp() });
    }
    await set(node, { state, last_active: serverTimestamp() });
  } catch {
    // Présence au mieux : jamais bloquante
  }
}

// Les écritures sont mises en file : la dernière reflète toujours l'état réel
function enqueue(uid, state) {
  pending = pending.then(() => write(uid, state));
  return pending;
}

/** Joueur connecté : présence active. */
export function startPresence(uid) {
  if (!uid || current.uid === uid) return;
  current = { uid, activity: current.activity };
  enqueue(uid, current.activity);
}

/** Déconnexion du compte : hors ligne. Renvoie une promesse (attendre avant la déconnexion Firebase). */
export function stopPresence() {
  if (!current.uid) return Promise.resolve();
  const uid = current.uid;
  current = { uid: null, activity: 'online' };
  return enqueue(uid, 'offline');
}

/** 'playing' pendant une partie, 'online' sinon. */
export function setPresenceActivity(activity) {
  if (current.activity === activity) return;
  current = { ...current, activity };
  if (current.uid) enqueue(current.uid, activity);
}
