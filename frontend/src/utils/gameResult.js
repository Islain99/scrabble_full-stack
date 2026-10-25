// src/utils/gameResult.js
//
// Résultat d'une partie terminée, du point de vue d'un joueur.
// Le gagnant est désigné par son identifiant (winner_id) : deux joueurs
// peuvent porter le même nom. winner_name ne sert que pour les parties
// enregistrées avant l'ajout de winner_id.

/** @returns {'win' | 'loss' | 'draw' | null} null si la partie n'est pas finie */
export function outcomeFor(gameState, player) {
  if (!gameState || gameState.status !== 'FINISHED' || !player) return null;
  if (gameState.is_draw) return 'draw';
  return isWinner(gameState, player) ? 'win' : 'loss';
}

export function isWinner(gameState, player) {
  if (!gameState || !player || gameState.is_draw) return false;
  if (gameState.winner_id !== undefined && gameState.winner_id !== null) {
    return player.id === gameState.winner_id;
  }
  return !!gameState.winner_name && player.name === gameState.winner_name;
}
