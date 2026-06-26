// src/hooks/useMultiplayerGame.js
//
// Gère l'intégralité d'une partie multijoueur :
//   - Sync temps réel via Firebase RTDB (onValue sur /games/{roomId})
//   - Fallback polling REST toutes les 5 s si RTDB indisponible
//   - Actions : playMove, passTurn, swapTiles
//   - Placement côté client (même logique que useGameLogic.js)
//
// Usage :
//   const mp = useMultiplayerGame({ roomId, currentUserId, addToast });
//   mp.gameState / mp.isMyTurn / mp.handleDropTile / mp.handleValidateWord ...

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../firebase'; // export nommé depuis firebase.js (voir note bas de fichier)
import * as mp from '../api/multiplayerService';
import { POINTS_LETTRES, BONUS_MAP } from '../data/constants';

// ── Score preview local (identique à useGameLogic) ────────────────

function calcPreview(placements) {
  if (!placements.length) return 0;
  let score = 0;
  let wordMult = 1;
  placements.forEach(p => {
    let ls = POINTS_LETTRES[p.letter] || 0;
    const bonus = BONUS_MAP[`${p.r}-${p.c}`];
    if (bonus === 'DL') ls *= 2;
    if (bonus === 'TL') ls *= 3;
    if (bonus === 'DM') wordMult *= 2;
    if (bonus === 'TM') wordMult *= 3;
    score += ls;
  });
  return score * wordMult;
}

// ── Hook ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   roomId: string,
 *   currentUserId: number,       // id PostgreSQL de l'utilisateur connecté
 *   hostUserId: number,          // pour déduire l'index joueur (0 = hôte, 1 = invité)
 *   addToast: Function,
 * }} options
 */
export function useMultiplayerGame({
  roomId,
  currentUserId,
  hostUserId,
  addToast = () => {},
} = {}) {

  const [gameState,  setGameState]  = useState(null);
  const [roomStatus, setRoomStatus] = useState('ACTIVE'); // ACTIVE | FINISHED
  const [placements, setPlacements] = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [isLoading,  setIsLoading]  = useState(false);

  // Index joueur courant (0 = hôte, 1 = invité)
  const myPlayerIndex = currentUserId === hostUserId ? 0 : 1;

  // ── Dérivés ───────────────────────────────────────────────────
  const isMyTurn = useMemo(() => {
    if (!gameState) return false;
    return gameState.current_player_index === myPlayerIndex;
  }, [gameState, myPlayerIndex]);

  const myRack = useMemo(() => {
    if (!gameState) return [];
    return gameState.players[myPlayerIndex]?.rack ?? [];
  }, [gameState, myPlayerIndex]);

  const placedOriginals = placements.map(p => p.originalTile);
  const availableRackTiles = myRack.filter(t => !placedOriginals.includes(t));

  const previewScore = useMemo(() => calcPreview(placements), [placements]);

  // ── Sync Firebase RTDB ────────────────────────────────────────
  const pollingRef = useRef(null);
  const rtdbListenerRef = useRef(null);

  const applyRoomState = useCallback((roomData) => {
    if (!roomData) return;
    if (roomData.game_state) setGameState(roomData.game_state);
    if (roomData.status)     setRoomStatus(roomData.status);
  }, []);

  useEffect(() => {
    if (!roomId) return;

    let usingRtdb = false;

    // Tentative RTDB
    try {
      if (rtdb) {
        const gameRef = ref(rtdb, `/games/${roomId}`);
        const unsubscribe = onValue(gameRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setGameState(data);
            usingRtdb = true;
          }
        });
        rtdbListenerRef.current = () => off(gameRef);
        // Si RTDB fonctionne, pas besoin de polling
        return () => {
          unsubscribe();
          rtdbListenerRef.current = null;
        };
      }
    } catch (err) {
      console.warn('[MP] RTDB indisponible, fallback polling REST :', err.message);
    }

    // Fallback : polling REST toutes les 5 s
    const poll = async () => {
      try {
        const room = await mp.getRoom(roomId);
        applyRoomState(room);
      } catch (e) {
        // silencieux — ne pas spammer les toasts
      }
    };
    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [roomId, applyRoomState]);

  // ── Placement côté client (identique à useGameLogic) ──────────

  const handleDropTile = useCallback((rackIndex, r, c) => {
    if (!isMyTurn || !gameState) return;
    const grid = gameState.board.grid;
    if (grid[r][c] !== null) return;
    if (placements.find(p => p.r === r && p.c === c)) return;

    const tile = availableRackTiles[rackIndex];
    if (!tile) return;

    setPlacements(prev => [...prev, {
      letter: tile.letter === '*' ? '?' : tile.letter,
      r, c,
      originalTile: tile,
      rackIndex,
    }]);
  }, [isMyTurn, gameState, placements, availableRackTiles]);

  const handleMoveTile = useCallback((fromR, fromC, toR, toC) => {
    if (!gameState) return;
    if (gameState.board.grid[toR][toC] !== null) return;
    if (placements.find(p => p.r === toR && p.c === toC)) return;

    setPlacements(prev => prev.map(p =>
      p.r === fromR && p.c === fromC ? { ...p, r: toR, c: toC } : p
    ));
  }, [gameState, placements]);

  const handleReturnTile = useCallback((r, c) => {
    setPlacements(prev => prev.filter(p => !(p.r === r && p.c === c)));
  }, []);

  const handleClearPlacements = useCallback(() => {
    setPlacements([]);
  }, []);

  // ── Actions réseau ────────────────────────────────────────────

  const handleValidateWord = useCallback(async () => {
    if (!roomId || placements.length === 0 || !isMyTurn) return { success: false };
    setIsLoading(true);
    try {
      const apiPlacements = placements.map(p => ({ r: p.r, c: p.c, letter: p.letter }));
      const room = await mp.playMove(roomId, apiPlacements);
      applyRoomState(room);
      setPlacements([]);
      return { success: true, error: null };
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Mot invalide.';
      addToast(msg, 'error');
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [roomId, placements, isMyTurn, applyRoomState, addToast]);

  const handlePassTurn = useCallback(async () => {
    if (!roomId || !isMyTurn) return;
    setIsLoading(true);
    try {
      const room = await mp.passTurn(roomId);
      applyRoomState(room);
      setPlacements([]);
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Erreur réseau.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, isMyTurn, applyRoomState, addToast]);

  const handleSwapTiles = useCallback(async () => {
    if (!roomId || !isMyTurn || selectedTilesToSwap.length === 0) return;
    setIsLoading(true);
    try {
      const room = await mp.swapTiles(roomId, selectedTilesToSwap);
      applyRoomState(room);
      setSelectedTilesToSwap([]);
      setPlacements([]);
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Échange impossible.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, isMyTurn, selectedTilesToSwap, applyRoomState, addToast]);

  const toggleTileForSwap = useCallback((letter) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  }, []);

  // ── API publique ──────────────────────────────────────────────
  return {
    // État
    gameState,
    roomStatus,
    placements,
    selectedTilesToSwap,
    isLoading,
    isMyTurn,
    myPlayerIndex,
    availableRackTiles,
    previewScore,

    // Actions placement
    handleDropTile,
    handleMoveTile,
    handleReturnTile,
    handleClearPlacements,

    // Actions réseau
    handleValidateWord,
    handlePassTurn,
    handleSwapTiles,
    toggleTileForSwap,
  };
}

