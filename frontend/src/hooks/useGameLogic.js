// src/hooks/useGameLogic.js
// Toute la logique métier du jeu.
// Les notifications (erreurs, IA, succès) passent toutes par `addToast`
// fourni en paramètre depuis GamePage via useToast().

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import * as gameService from '../api/gameService';
import { saveGame } from '../api/authService';
import { calculatePreviewScore } from '../utils/scoring';
import { useLanguage } from '../context/LanguageContext';
import { isWinner } from '../utils/gameResult';

// ── Partie en cours mémorisée (reprise au retour) ─────────────────
// La partie elle-même est conservée par le serveur (table solo_games) ; le
// navigateur garde son identifiant et l'état du minuteur pour la reprendre.

const sessionKey = (user) => `scrabble-solo-session:${user?.id ?? 'guest'}`;

function readSession(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeSession(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* stockage indisponible */ }
}
function clearSession(key) {
  try { localStorage.removeItem(key); } catch { /* stockage indisponible */ }
}

// ── Page visible ? (appli en arrière-plan, onglet caché) ──────────
function subscribeVisibility(callback) {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}
const getVisible = () => document.visibilityState !== 'hidden';
const getVisibleServer = () => true;

// ── Hook principal ────────────────────────────────────────────────

/**
 * @param {{
 *   isAuthenticated: boolean,
 *   user: object|null,
 *   autoSortRack: boolean,
 *   turnDuration: number,          // secondes par tour, 0 = sans minuteur
 *   addToast: (message: string, type: 'info'|'success'|'error'|'warn') => void
 * }} options
 */
export function useGameLogic({
  isAuthenticated,
  user,
  autoSortRack = false,
  turnDuration = 0,
  addToast = () => {},
} = {}) {
  const { t, tp } = useLanguage();
  const storageKey = sessionKey(user);

  // ── State ─────────────────────────────────────────────────────
  const [gameState, setGameState]                     = useState(null);
  const [gameId, setGameId]                           = useState(null);
  const [placements, setPlacements]                   = useState([]);
  const [pendingJoker, setPendingJoker]               = useState(null); // { tile, r, c }
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]             = useState(null);
  const [gameSaved, setGameSaved]                     = useState(false);
  const [gameDifficulty, setGameDifficulty]           = useState('medium');   // pour l'historique
  const [timerActive, setTimerActive]                 = useState(false);
  const [isLoading, setIsLoading]                     = useState(false);
  const [showAbandonModal, setShowAbandonModal]       = useState(false);

  // Minuteur du tour, tenu ici (et plus dans TurnTimer) pour pouvoir le mettre
  // en pause, le sauvegarder et le reprendre au retour du joueur.
  const [turnNo, setTurnNo]               = useState(0);       // n° du tour du joueur
  const [turnRemaining, setTurnRemaining] = useState(0);       // secondes restantes
  const remainingRef                      = useRef(0);
  const [paused, setPaused]               = useState(false);   // bouton Pause
  const [resumeOffer, setResumeOffer]     = useState(null);    // { saved, gameState }
  const visible = useSyncExternalStore(subscribeVisibility, getVisible, getVisibleServer);

  const setRemaining = useCallback((value) => {
    remainingRef.current = value;
    setTurnRemaining(value);
  }, []);

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

  const previewScore = useMemo(
    () => calculatePreviewScore(placements, gameState?.board?.grid),
    [placements, gameState]
  );
  const isSwapMode   = selectedTilesToSwap.length > 0;

  // ── Tour IA automatique ───────────────────────────────────────
  // En pause (bouton ou appli en arrière-plan), l'IA attend elle aussi.
  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId || paused || !visible) return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer?.is_ai) return;

    const delay = setTimeout(async () => {
      try {
        const { gameState: updated, message, move } = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
        // Retour au joueur : nouveau tour, minuteur plein
        if (updated?.status === 'ACTIVE' && !updated.players[updated.current_player_index]?.is_ai) {
          setTurnNo(n => n + 1);
          setRemaining(turnDuration);
        }
        // Message composé dans la langue du joueur ; repli sur celui du serveur
        const name = currentPlayer.name;
        if (move?.kind === 'play')      addToast(t('ai_move_play', { name, word: move.word, score: move.score }), 'info');
        else if (move?.kind === 'swap') addToast(tp('ai_move_swap', move.count, { name }), 'info');
        else if (move?.kind === 'pass') addToast(t('ai_move_pass', { name }), 'info');
        else if (message)               addToast(message, 'info');
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail);
        addToast(t('toast_ai_error'), 'warn');
      }
    }, 1500);

    return () => clearTimeout(delay);
  }, [gameState, gameId, paused, visible, turnDuration, setRemaining, addToast, t, tp]);

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
      ai_difficulty:    gameDifficulty,
      won:              isWinner(gameState, humanPlayer),
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
  }, [gameState, gameId, gameStartTime, gameDifficulty, isAuthenticated, gameSaved]);

  // ── Actions ───────────────────────────────────────────────────

  const initSwapMode  = useCallback(() => setSelectedTilesToSwap(['__placeholder__']), []);
  const clearSwapMode = useCallback(() => setSelectedTilesToSwap([]), []);

  const startGame = useCallback(async (difficulty = 'medium') => {
    setIsLoading(true);
    // Une partie en cours proposée à la reprise est abandonnée sans être comptée
    if (resumeOffer) {
      gameService.abandonGame(resumeOffer.saved.gameId, 0).catch(() => {});
      clearSession(storageKey);
      setResumeOffer(null);
    }
    try {
      const playerName = isAuthenticated && user?.display_name ? user.display_name : t('player_default');
      const initialGame = await gameService.startGame([playerName, 'HAL 9000 (IA)'], difficulty);
      setGameDifficulty(difficulty);
      setGameState(initialGame);
      setGameId(initialGame.game_id);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(Date.now());
      setGameSaved(false);
      setTimerActive(true);
      setTurnNo(1);
      setRemaining(turnDuration);
      setPaused(false);
    } catch (e) {
      console.error('Erreur démarrage:', e);
      addToast(t('toast_start_error'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, addToast, t, resumeOffer, storageKey, turnDuration, setRemaining]);

  /** Reprend la partie proposée au retour du joueur, minuteur compris. */
  const resumeGame = useCallback(() => {
    if (!resumeOffer) return;
    const { saved, gameState: gs } = resumeOffer;
    setGameState(gs);
    setGameId(saved.gameId);
    setGameDifficulty(saved.difficulty ?? 'medium');
    setGameStartTime(saved.startedAt ?? Date.now());
    setGameSaved(false);
    setPlacements([]);
    setSelectedTilesToSwap([]);
    setTimerActive(true);
    setTurnNo(saved.turnNo ?? 1);
    const left = Number.isFinite(saved.remaining) && saved.remaining > 0 ? saved.remaining : turnDuration;
    setRemaining(Math.min(left, turnDuration));
    setPaused(false);
    setResumeOffer(null);
  }, [resumeOffer, turnDuration, setRemaining]);

  // Au retour sur l'écran de jeu : une partie non terminée est-elle à reprendre ?
  useEffect(() => {
    if (gameState) return;
    const saved = readSession(storageKey);
    if (!saved?.gameId) return;
    let cancelled = false;
    gameService.getGameStatus(saved.gameId)
      .then((gs) => {
        if (cancelled) return;
        if (gs?.status === 'ACTIVE') setResumeOffer({ saved, gameState: gs });
        else clearSession(storageKey);
      })
      .catch((err) => {
        // Partie introuvable (purgée) : on oublie ; erreur réseau : on réessaiera
        if (!cancelled && err?.response?.status === 404) clearSession(storageKey);
      });
    return () => { cancelled = true; };
  }, [gameState, storageKey]);

  // Sauvegarde continue de la partie en cours (et du temps restant du tour)
  useEffect(() => {
    if (!gameId || !gameState) return;
    if (gameState.status !== 'ACTIVE') { clearSession(storageKey); return; }
    writeSession(storageKey, {
      gameId,
      difficulty: gameDifficulty,
      startedAt:  gameStartTime,
      turnNo,
      remaining:  turnRemaining,
      savedAt:    Date.now(),
    });
  }, [storageKey, gameId, gameState, gameDifficulty, gameStartTime, turnNo, turnRemaining]);

  /** Déposer une tuile du rack sur une case du plateau. */
  const handleDropTile = useCallback((rackIndex, r, c) => {
    // L'index vient du rack affiché (trié si autoSortRack) : on lit la même liste
    const tileToPlace = rackTilesForDisplay[rackIndex];
    if (!tileToPlace) return;
    if (placements.some(pl => pl.r === r && pl.c === c)) return;
    // Joker : on demande d'abord quelle lettre il représente (voir chooseJokerLetter)
    if (tileToPlace.letter === '*') {
      setPendingJoker({ tile: tileToPlace, r, c });
      return;
    }
    setPlacements(prev => [...prev, { letter: tileToPlace.letter, r, c, originalTile: tileToPlace, rackIndex }]);
  }, [rackTilesForDisplay, placements]);

  /**
   * Lettre choisie pour le joker en attente. Elle est envoyée à l'API en
   * minuscule : c'est la convention du backend pour « joker joué comme ».
   */
  const chooseJokerLetter = useCallback((letter) => {
    if (!pendingJoker) return;
    const { tile, r, c } = pendingJoker;
    setPendingJoker(null);
    setPlacements(prev =>
      prev.some(pl => (pl.r === r && pl.c === c) || pl.originalTile === tile)
        ? prev
        : [...prev, { letter: letter.toLowerCase(), r, c, originalTile: tile }]
    );
  }, [pendingJoker]);

  const cancelJoker = useCallback(() => setPendingJoker(null), []);

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

  /** Reprendre toutes les tuiles posées ce tour-ci. */
  const handleClearPlacements = useCallback(() => setPlacements([]), []);

  const handleValidateWord = useCallback(async () => {
    if (!gameId || placements.length === 0) {
      addToast(t('toast_place_first'), 'warn');
      return;
    }
    setSelectedTilesToSwap([]);
    const placementsAPI = placements.map(p => [p.r, p.c, p.letter]);
    try {
      const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
      setGameState(result);
      // Bonus bingo : 7 tuiles posées d'un coup
      if (placements.length === 7) {
        addToast(t('toast_bingo'), 'success');
      }
      setPlacements([]);
    } catch (error) {
      const detail = error.response?.data?.detail || t('toast_word_invalid');
      addToast(detail, 'error');
      setPlacements([]);
    }
  }, [gameId, placements, activePlayerId, addToast, t]);

  const handlePassTurn = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      addToast(t('toast_passed'), 'info');
    } catch (error) {
      const detail = error.response?.data?.detail || t('toast_pass_error');
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, addToast, t]);

  const handleShuffleRack = useCallback(async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.shuffleRack(gameId, activePlayerId);
      setGameState(updated);
      addToast(t('toast_shuffled'), 'success');
    } catch (error) {
      const detail = error.response?.data?.detail || t('toast_shuffle_error');
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, addToast, t]);

  const handleSwapTiles = useCallback(async () => {
    const realTiles = selectedTilesToSwap.filter(l => l !== '__placeholder__');
    if (!gameId || realTiles.length === 0) {
      addToast(t('toast_swap_select'), 'warn');
      return;
    }
    setPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, activePlayerId, realTiles);
      setGameState(updated);
      setSelectedTilesToSwap([]);
      addToast(tp('toast_swapped', realTiles.length), 'success');
    } catch (error) {
      const detail = error.response?.data?.detail || t('toast_swap_error');
      addToast(detail, 'error');
    }
  }, [gameId, activePlayerId, selectedTilesToSwap, addToast, t, tp]);

  /** Expiration du timer → passe le tour automatiquement. */
  const handleTimerExpire = useCallback(async () => {
    if (!gameId || isAITurn) return;
    setPlacements([]);
    setSelectedTilesToSwap([]);
    addToast(t('toast_time_up'), 'warn');
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
    } catch (e) {
      console.error('Auto-pass échoué:', e);
    }
  }, [gameId, activePlayerId, isAITurn, addToast, t]);

  // ── Minuteur du tour ──────────────────────────────────────────
  // Il tourne pendant le tour du joueur, sauf en pause ou appli en arrière-plan.
  const timerOn = turnDuration > 0 && timerActive && !!gameState
    && gameState.status === 'ACTIVE' && !isAITurn;
  const timerRunning = timerOn && !paused && visible && turnRemaining > 0;
  const expireRef = useRef(handleTimerExpire);
  useEffect(() => { expireRef.current = handleTimerExpire; }, [handleTimerExpire]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      const next = Math.max(0, Math.min(remainingRef.current, turnDuration) - 1);
      remainingRef.current = next;
      setTurnRemaining(next);
      if (next === 0) expireRef.current?.();
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, turnDuration]);

  const togglePause = useCallback(() => setPaused(p => !p), []);

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
            ai_difficulty:    gameDifficulty,
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
      clearSession(storageKey);

    } catch (err) {
      console.warn('Abandon backend error:', err?.response?.data?.detail || err.message);
      // Réinitialisation locale si le backend échoue
      setGameState(null);
      setGameId(null);
      setPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(null);
      setGameSaved(false);
      clearSession(storageKey);
    }
  }, [gameState, gameId, gameDifficulty, isAuthenticated, gameStartTime, storageKey]);

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
    pendingJoker,
    // Minuteur, pause, reprise
    timerOn,
    turnDuration,
    turnRemaining: Math.min(turnRemaining, turnDuration),
    paused,
    resumeOffer,

    // Actions
    startGame,
    resumeGame,
    togglePause,
    handleDropTile,
    chooseJokerLetter,
    cancelJoker,
    handleMoveTile,
    handleReturnTile,
    handleClearPlacements,
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
