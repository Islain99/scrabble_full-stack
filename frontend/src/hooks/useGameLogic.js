// src/hooks/useGameLogic.js
// Toute la logique métier du jeu — extraite de App.jsx.
// Miroir du useGameLogic.ts de l'app mobile.

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
 * @param {{ isAuthenticated: boolean, user: object|null, autoSortRack: boolean }} options
 */
export function useGameLogic({ isAuthenticated, user, autoSortRack = false } = {}) {

  // ── State ─────────────────────────────────────────────────────
  const [gameState, setGameState]                   = useState(null);
  const [gameId, setGameId]                         = useState(null);
  const [placements, setPlacements]                 = useState([]);       // tuiles posées temporairement
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]           = useState(null);
  const [gameSaved, setGameSaved]                   = useState(false);
  const [aiMessage, setAiMessage]                   = useState(null);
  const [timerActive, setTimerActive]               = useState(false);
  const [isLoading, setIsLoading]                   = useState(false);
  const [showAbandonModal, setShowAbandonModal]     = useState(false);

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

  // ── IA auto-play ──────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId) return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer?.is_ai) return;

    const delay = setTimeout(async () => {
      try {
        const { gameState: updated, message } = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
        if (message) {
          setAiMessage(message);
          setTimeout(() => setAiMessage(null), 4000);
        }
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail);
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
      alert('Erreur lors du démarrage. Vérifiez votre connexion au backend.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user]);

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
      alert('Veuillez placer un mot sur le plateau.');
      return;
    }
    setSelectedTilesToSwap([]);
    const placementsAPI = placements.map(p => [p.r, p.c, p.letter]);
    try {
      const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
      setGameState(result);
      setPlacements([]);
      if (result.status !== 'FINISHED') {
        timerResetRef.current?.();
      }
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Mot invalide ou placement illégal.'}`);
      setPlacements([]);
    }
  }, [gameId, placements, activePlayerId]);

  const handlePassTurn = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  }, [gameId, activePlayerId]);

  const handleShuffleRack = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.shuffleRack(gameId, activePlayerId);
      setGameState(updated);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  }, [gameId, activePlayerId]);

  const handleSwapTiles = useCallback(async () => {
    if (!gameId || selectedTilesToSwap.length === 0) {
      alert('Sélectionnez les lettres à échanger.');
      return;
    }
    setPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, activePlayerId, selectedTilesToSwap);
      setGameState(updated);
      setSelectedTilesToSwap([]);
    } catch (error) {
      alert(`Échec de l'échange : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  }, [gameId, activePlayerId, selectedTilesToSwap]);

  /** Expiration du timer → passe le tour automatiquement. */
  const handleTimerExpire = useCallback(async () => {
    if (!gameId || isAITurn) return;
    setPlacements([]);
    setSelectedTilesToSwap([]);
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      timerResetRef.current?.();
    } catch (e) {
      console.error('Auto-pass échoué:', e);
    }
  }, [gameId, activePlayerId, isAITurn]);

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
      setGameState(null);
      setGameId(null);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(null);
      setGameSaved(false);
    }
  }, [gameState, gameId, isAuthenticated, gameStartTime]);

  // ── API publique du hook ──────────────────────────────────────
  return {
    // État
    gameState,
    gameId,
    placements,
    selectedTilesToSwap,
    aiMessage,
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