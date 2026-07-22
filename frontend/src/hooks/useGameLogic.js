// src/hooks/useGameLogic.js
// Toute la logique métier du jeu.
// Les notifications (erreurs, IA, succès) passent toutes par `addToast`
// fourni en paramètre depuis GamePage via useToast().

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as gameService from '../api/gameService';
import { saveGame } from '../api/authService';
import { POINTS_LETTRES, BONUS_MAP } from '../data/constants';

// ── Score preview (côté client, approximatif) ─────────────────────

function calculatePreviewScore(placements) {
  if (placements.length === 0) return 0;
  let score = 0;
  let wordMultiplier = 1;
  placements.forEach(p => {
    let letterScore = POINTS_LETTRES[p.letter] || 0;
    const bonus = BONUS_MAP[`${p.r}-${p.c}`];
    if (bonus === 'DL') letterScore *= 2;
    if (bonus === 'TL') letterScore *= 3;
    if (bonus === 'DM') wordMultiplier *= 2;
    if (bonus === 'TM') wordMultiplier *= 3;
    score += letterScore;
  });
  return score * wordMultiplier;
}

// ── Hook principal ────────────────────────────────────────────────

/**
 * @param {{
 *   isAuthenticated: boolean,
 *   user: object|null,
 *   autoSortRack: boolean,
 *   addToast: (message: string, type: 'info'|'success'|'error'|'warn') => void
 * }} options
 */
export function useGameLogic({
  isAuthenticated,
  user,
  autoSortRack = false,
  addToast = () => {},
} = {}) {

  // ── State ─────────────────────────────────────────────────────
  const [gameState, setGameState]                     = useState(null);
  const [gameId, setGameId]                           = useState(null);
  const [placements, setPlacements]                   = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]             = useState(null);
  const [gameSaved, setGameSaved]                     = useState(false);
  const [timerActive, setTimerActive]                 = useState(false);
  const [isLoading, setIsLoading]                     = useState(false);
  const [showAbandonModal, setShowAbandonModal]       = useState(false);

  const timerResetRef = useRef(null);

  // ── Dérivés ───────────────────────────────────────────────────
  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id
    : 0;

  const isAITurn = gameState
    ? gameState.players[gameState.current_player_index]?.is_ai ?? false
    : false;

  const currentRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
  const tilesInUse  = placements.map(p => p.originalTile);
  const availableRackTiles = currentRack.filter(tile => !tilesInUse.includes(tile));

  const rackTilesForDisplay = useMemo(() =>
    autoSortRack
      ? [...availableRackTiles].sort((a, b) => a.letter.localeCompare(b.letter))
      : availableRackTiles,
    [availableRackTiles, autoSortRack]
  );

  const previewScore = useMemo(() => calculatePreviewScore(placements), [placements]);
  const isSwapMode   = selectedTilesToSwap.length > 0;

  // ── Tour IA automatique ───────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId) return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer?.is_ai) return;

    const delay = setTimeout(async () => {
      try {
        const { gameState: updated, message } = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
        if (message) addToast(message, 'info');
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail);
        addToast('L\'IA a rencontré une erreur. Tour passé.', 'warn');
      }
    }, 1500);

    return () => clearTimeout(delay);
  }, [gameState, gameId]);

  // ── Sauvegarde auto en fin de partie ─────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'FINISHED' || !isAuthenticated || gameSaved) return;

    const humanPlayer = gameState.players.find(p => !p.is_ai);
    const aiPlayer    = gameState.players.find(p => p.is_ai);
    if (!humanPlayer || !aiPlayer) return;

    const duration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null;

    const payload = {
      game_id:          String(gameId),
      user_score:       Number(humanPlayer.score)  || 0,
      ai_name:          String(aiPlayer.name)      || 'HAL 9000',
      ai_score:         Number(aiPlayer.score)     || 0,
      ai_difficulty:    'medium',
      won:              gameState.winner_name === humanPlayer.name,
      duration_seconds: duration !== null ? Number(duration) : null,
      turns_count:      Number(gameState.passes_count) || 0,
      best_word:        null,
      best_word_score:  0,
    };

    const doSave = async () => {
      try {
        await saveGame(payload);
        setGameSaved(true);
      } catch (err) {
        if (err?.response?.status === 409) { setGameSaved(true); return; }
        console.error('Sauvegarde échouée', err?.response?.data);
      }
    };

    doSave();
  }, [gameState?.status, gameState?.winner_name, isAuthenticated, gameSaved]);

  // ── Actions ───────────────────────────────────────────────────

  const initSwapMode  = useCallback(() => setSelectedTilesToSwap(['__placeholder__']), []);
  const clearSwapMode = useCallback(() => setSelectedTilesToSwap([]), []);

  const startGame = useCallback(async (difficulty = 'medium') => {
    setIsLoading(true);
    try {
      const playerName = isAuthenticated && user?.display_name ? user.display_name : 'Joueur';
      const initialGame = await gameService.startGame([playerName, 'HAL 9000 (IA)'], difficulty);
      setGameState(initialGame);
      setGameId(initialGame.game_id);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(Date.now());
      setGameSaved(false);
      setTimerActive(true);
    } catch (e) {
      console.error('Erreur démarrage:', e);
      addToast('Impossible de démarrer la partie. Vérifiez votre connexion.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, addToast]);

  /** Déposer une tuile du rack sur une case du plateau. */
  const handleDropTile = useCallback((rackIndex, r, c) => {
    const tileToPlace = availableRackTiles[rackIndex];
    if (!tileToPlace) return;
    if (placements.some(pl => pl.r === r && pl.c === c)) return;
    setPlacements(prev => [...prev, { letter: tileToPlace.letter, r, c, originalTile: tileToPlace, rackIndex }]);
  }, [availableRackTiles, placements]);

  /** Déplacer une tuile temporaire d'une case à une autre. */
  const handleMoveTile = useCallback((fromR, fromC, toR, toC) => {
    if (placements.some(pl => pl.r === toR && pl.c === toC)) return;
    setPlacements(prev =>
      prev.map(pl => pl.r === fromR && pl.c === fromC ? { ...pl, r: toR, c: toC } : pl)
    );
  }, [placements]);

  /** Retirer une tuile temporaire du plateau → retour dans le rack. */
  const handleReturnTile = useCallback((r, c) => {
    setPlacements(prev => prev.filter(pl => !(pl.r === r && pl.c === c)));
  }, []);

  const handleValidateWord = useCallback(async () => {
    if (!gameId || placements.length === 0) {
      addToast('Placez au moins une lettre sur le plateau.', 'warn');
      return;
    }
    setSelectedTilesToSwap([]);
    const placementsAPI = placements.map(p => [p.r, p.c, p.letter]);
    try {
      const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
      setGameState(result);
      // Bonus bingo : 7 tuiles posées d'un coup
      if (placements.length === 7) {
        addToast('🎉 Bingo ! 7 lettres posées — bonus 50 pts !', 'success');
      }
      setPlacements([]);
      if (result.status !== 'FINISHED') {
        timerResetRef.current?.();
      }
    } catch (error) {
      const detail = error.response?.data?.detail || 'Mot invalide ou placement illégal.';
      addToast(detail, 'error');
      setPlacements([]);
    }
  }, [gameId, placements, activePlayerId, addToast]);

  const handlePassTurn = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      addToast('Tour passé.', 'info');
    } catch (error) {
      const detail = error.response?.data?.detail || 'Impossible de passer le tour.';
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, addToast]);

  const handleShuffleRack = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.shuffleRack(gameId, activePlayerId);
      setGameState(updated);
      addToast('Rack mélangé.', 'success');
    } catch (error) {
      const detail = error.response?.data?.detail || 'Impossible de mélanger le rack.';
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, addToast]);

  const handleSwapTiles = useCallback(async () => {
    const realTiles = selectedTilesToSwap.filter(l => l !== '__placeholder__');
    if (!gameId || realTiles.length === 0) {
      addToast('Sélectionnez les lettres à échanger.', 'warn');
      return;
    }
    setPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, activePlayerId, realTiles);
      setGameState(updated);
      setSelectedTilesToSwap([]);
      addToast(`${realTiles.length} lettre(s) échangée(s).`, 'success');
    } catch (error) {
      const detail = error.response?.data?.detail || 'Échange impossible.';
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, selectedTilesToSwap, addToast]);

  /** Expiration du timer → passe le tour automatiquement. */
  const handleTimerExpire = useCallback(async () => {
    if (!gameId || isAITurn) return;
    setPlacements([]);
    setSelectedTilesToSwap([]);
    addToast('Temps écoulé — tour passé automatiquement.', 'warn');
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      timerResetRef.current?.();
    } catch (e) {
      console.error('Auto-pass échoué:', e);
    }
  }, [gameId, activePlayerId, isAITurn, addToast]);

  const toggleTileForSwap = useCallback((letter) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  }, []);

  const handleAbandonConfirm = useCallback(async () => {
    setShowAbandonModal(false);

    const humanPlayer = gameState.players.find(p => !p.is_ai);
    const aiPlayer    = gameState.players.find(p => p.is_ai);
    const capturedId  = gameId;

    try {
      const finalState = await gameService.abandonGame(capturedId, humanPlayer?.id ?? 0);

      if (isAuthenticated) {
        try {
          await saveGame({
            game_id:          String(gameId),
            user_score:       Number(humanPlayer?.score) || 0,
            ai_name:          String(aiPlayer?.name)     || 'HAL 9000',
            ai_score:         Number(aiPlayer?.score)    || 0,
            ai_difficulty:    'medium',
            won:              false,
            duration_seconds: gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null,
            turns_count:      Number(gameState.passes_count) || 0,
            best_word:        null,
            best_word_score:  0,
          });
        } catch (saveErr) {
          if (saveErr?.response?.status !== 409) {
            console.warn('Sauvegarde abandon échouée:', saveErr?.response?.data?.detail || saveErr.message);
          }
        }
      }

      setGameSaved(true);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameState(finalState);

    } catch (err) {
      console.warn('Abandon backend error:', err?.response?.data?.detail || err.message);
      // Réinitialisation locale si le backend échoue
      setGameState(null);
      setGameId(null);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(null);
      setGameSaved(false);
    }
  }, [gameState, gameId, isAuthenticated, gameStartTime]);

  console.log('useGameLogic: gameState: ', gameState, 'gameId: ', gameId, 'placements: ', placements, 'selectedTilesToSwap: ', selectedTilesToSwap);

  // ── API publique du hook ──────────────────────────────────────
  return {
    // État
    gameState,
    gameId,
    placements,
    selectedTilesToSwap,
    timerActive,
    isLoading,
    isSwapMode,
    isAITurn,
    showAbandonModal,
    activePlayerId,
    rackTilesForDisplay,
    previewScore,
    timerResetRef,

    // Actions
    startGame,
    handleDropTile,
    handleMoveTile,
    handleReturnTile,
    handleValidateWord,
    handlePassTurn,
    handleShuffleRack,
    handleSwapTiles,
    handleTimerExpire,
    toggleTileForSwap,
    handleAbandonConfirm,
    setShowAbandonModal,
    initSwapMode,
    clearSwapMode,
  };
}