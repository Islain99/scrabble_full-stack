// src/utils/gameState.js
//
// État de partie reçu de Firebase (Realtime Database).
//
// Firebase ne stocke pas `null` : envoyé tel quel, un plateau vide (225 cases
// à null) disparaît, un plateau entamé devient un objet clairsemé et un
// chevalet vide disparaît. Le serveur envoie donc l'état en texte JSON
// ({ state: "<json>", v: 2 }) ; decodeLiveState() le relit tel quel.
// normalizeGameState() reste une ceinture de sécurité pour les nœuds écrits
// avant ce format (salles créées avant le déploiement).

const SIZE = 15;

/** Tableau ou objet {index: valeur} (forme Firebase) → tableau de longueur n, trous à null. */
function toArray(value, length = null) {
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => { out[i] = v ?? null; });
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0) out[i] = v ?? null;
    });
  }
  const n = length ?? out.length;
  return Array.from({ length: n }, (_, i) => out[i] ?? null);
}

/** Complète un état de partie amputé : plateau 15 × 15, chevalets et sac en tableaux. */
export function normalizeGameState(gs) {
  if (!gs || typeof gs !== 'object') return null;
  const grid = toArray(gs.board?.grid, SIZE).map(row => toArray(row, SIZE));
  const players = toArray(gs.players).filter(Boolean).map(p => ({
    ...p,
    score: p.score ?? 0,
    rack: toArray(p.rack).filter(Boolean),
  }));
  return {
    ...gs,
    board: { ...(gs.board ?? {}), grid },
    players,
    remaining_tiles: toArray(gs.remaining_tiles).filter(v => v !== null),
    current_player_index: gs.current_player_index ?? 0,
    passes_count: gs.passes_count ?? 0,
    winner_name: gs.winner_name ?? null,
    winner_id: gs.winner_id ?? null,
    is_draw: gs.is_draw ?? false,
    moves: toArray(gs.moves).filter(Boolean),
  };
}

/**
 * Valeur lue sur /games/{salle}/for_host|for_guest → état de partie, ou null.
 * Format v2 : { state: "<json>" } ; ancien format : l'état lui-même.
 */
export function decodeLiveState(value) {
  if (!value) return null;
  if (typeof value.state === 'string') {
    try {
      return normalizeGameState(JSON.parse(value.state));
    } catch {
      return null;
    }
  }
  return normalizeGameState(value);
}

/** Dernier coup joué (pose de mots) : ses cases, pour les mettre en évidence. */
export function lastPlayedCells(gs) {
  const last = gs?.moves?.at?.(-1);
  return last?.kind === 'play' && Array.isArray(last.cells) ? last.cells : null;
}
