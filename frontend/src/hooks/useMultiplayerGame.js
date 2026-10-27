// src/hooks/useMultiplayerGame.js
//
// Gère l'intégralité d'une partie multijoueur :
//   - Sync temps réel via Firebase RTDB (onValue sur /games/{roomId}/for_host
//     ou /games/{roomId}/for_guest selon myPlayerIndex)
//   - Fallback polling REST toutes les 5 s si RTDB indisponible, injoignable
//     (aucun événement après 8 s) ou lecture refusée
//   - Actions : playMove, passTurn, swapTiles, resign, claimWin, shuffleRack
//   - Délai d'inactivité : canClaim passe à true quand l'adversaire n'a pas
//     joué depuis claim_after_s (le serveur vérifie de son côté)
//   - Placement côté client (même logique que useGameLogic.js)
//
// FIX B2 — Fuite des racks via RTDB :
//   Avant : écoute sur /games/{roomId} → game_state complet visible des deux côtés.
//   Après : écoute sur /games/{roomId}/for_host (myPlayerIndex=0) ou
//           /games/{roomId}/for_guest (myPlayerIndex=1). Le backend pousse deux
//           payloads distincts avec le rack adverse masqué dans chaque chemin.
//   myPlayerIndex ajouté aux dépendances du useEffect pour recréer le listener
//   si le rôle change (ne devrait pas arriver en pratique, mais sûr).
//
// FIX B4 — Sélection d'échange par lettre (string) :
//   Avant : selectedTilesToSwap = string[] (lettres). Avec deux tuiles identiques
//           (ex : deux 'E'), impossible de les sélectionner indépendamment.
//   Après : selectedTilesToSwap = number[] (indices de rack).
//           toggleTileForSwap(index) bascule l'index dans le tableau.
//           handleSwapTiles convertit les indices en lettres avant l'appel API.
//
// Usage :
//   const mp = useMultiplayerGame({ roomId, currentUserId, hostUserId, addToast });
//   mp.gameState / mp.isMyTurn / mp.handleDropTile / mp.handleValidateWord ...

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getRtdb } from '../firebase';
import * as mp from '../api/multiplayerService';
import { calculatePreviewScore } from '../utils/scoring';
import { decodeLiveState, normalizeGameState } from '../utils/gameState';
import { useLanguage } from '../context/LanguageContext';

const DEFAULT_CLAIM_AFTER_MS = 10 * 60 * 1000;
const RTDB_TIMEOUT_MS = 8000;

/** Empreinte d'un état : change à chaque coup (sert à dater la dernière action). */
/**
 * Garde l'objet précédent quand rien n'a changé pour ce joueur : un mélange du
 * chevalet adverse (masqué) renvoie le même état, et remplacer les tuiles du
 * chevalet ferait perdre les placements en cours (comparés par référence).
 */
function keepIfSame(prev, next) {
  if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return prev;
  return next;
}

function stateSignature(gs) {
  if (!gs) return '';
  const scores = (gs.players ?? []).map(p => p.score).join(',');
  return `${gs.status}|${gs.current_player_index}|${gs.passes_count}|${(gs.remaining_tiles ?? []).length}|${scores}`;
}

// ── Hook ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   roomId: string,
 *   currentUserId: number,
 *   hostUserId: number,
 *   addToast: Function,
 * }} options
 */
export function useMultiplayerGame({
  roomId,
  currentUserId,
  hostUserId,
  addToast = () => {},
} = {}) {
  const { t } = useLanguage();

  // État rangé avec sa salle : après une revanche (nouvelle salle), l'état de
  // la partie terminée n'est plus servi, sans effet de réinitialisation
  const [live, setLive] = useState({ roomId: null, gameState: null, status: 'ACTIVE' });
  const gameState  = live.roomId === roomId ? live.gameState : null;
  const roomStatus = live.roomId === roomId ? live.status : 'ACTIVE';
  const [placements, setPlacements] = useState([]);
  const [pendingJoker, setPendingJoker] = useState(null); // { tile, r, c }
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [isLoading,  setIsLoading]  = useState(false);

  // Délai d'inactivité : date de la dernière action (ms) et délai du serveur
  const [lastActionAt, setLastActionAt] = useState(null);
  const [claimAfterMs, setClaimAfterMs] = useState(DEFAULT_CLAIM_AFTER_MS);
  const [now, setNow] = useState(0);
  const signatureRef = useRef('');

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

  const previewScore = useMemo(
    () => calculatePreviewScore(placements, gameState?.board?.grid),
    [placements, gameState]
  );

  // ── Sync Firebase RTDB ────────────────────────────────────────
  // État reçu de Firebase : la dernière action est datée à réception si l'état a changé
  const applyLiveState = useCallback((rid, raw) => {
    // Firebase : état encodé en texte JSON (voir utils/gameState.js)
    const data = decodeLiveState(raw);
    if (!data) return;
    setLive(prev => prev.roomId === rid
      ? { ...prev, gameState: keepIfSame(prev.gameState, data) }
      : { roomId: rid, gameState: data, status: 'ACTIVE' });
    const signature = stateSignature(data);
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      setLastActionAt(Date.now());
    }
  }, []);

  // Réponse du serveur (REST) : fait foi, y compris pour la date de la dernière action
  const applyRoomState = useCallback((roomData) => {
    if (!roomData?.room_id) return;
    const rid = roomData.room_id;
    const gs  = roomData.game_state ? normalizeGameState(roomData.game_state) : null;
    if (gs) signatureRef.current = stateSignature(gs);
    setLive(prev => {
      const same = prev.roomId === rid;
      return {
        roomId: rid,
        gameState: gs ? keepIfSame(same ? prev.gameState : null, gs) : (same ? prev.gameState : null),
        status: roomData.status ?? (same ? prev.status : 'ACTIVE'),
      };
    });
    if (roomData.last_action_at) setLastActionAt(Date.parse(roomData.last_action_at));
    if (roomData.claim_after_s)  setClaimAfterMs(roomData.claim_after_s * 1000);
  }, []);

  useEffect(() => {
    if (!roomId) return;

    // FIX B2 : écouter le sous-chemin dédié au joueur courant.
    // Le backend pousse /games/{roomId}/for_host et /games/{roomId}/for_guest
    // avec le rack adverse masqué dans chacun.
    const rtdbSubPath = myPlayerIndex === 0
      ? `/games/${roomId}/for_host`
      : `/games/${roomId}/for_guest`;

    let cancelled   = false;
    let unsubscribe = null;
    let pollTimer   = null;

    // Repli : polling REST toutes les 5 s si la base temps réel est indisponible.
    // GET /rooms/{roomId} retourne aussi un game_state masqué (rack adverse caché).
    const startPolling = () => {
      const poll = async () => {
        try {
          const room = await mp.getRoom(roomId);
          if (!cancelled) applyRoomState(room);
        } catch {
          // silencieux — ne pas spammer les toasts
        }
      };
      poll();
      pollTimer = setInterval(poll, 5000);
    };

    // État initial et date de la dernière action (le temps réel ne la porte pas)
    mp.getRoom(roomId)
      .then((room) => { if (!cancelled) applyRoomState(room); })
      .catch(() => { /* le temps réel ou le polling prendront le relais */ });

    // Aucun événement Firebase après RTDB_TIMEOUT_MS (réseau bloqué, base
    // injoignable) : le premier événement arrive même quand le chemin est
    // vide, donc son absence signifie qu'on n'est pas connecté → polling.
    let gotEvent = false;
    const watchdog = setTimeout(() => {
      if (!cancelled && !gotEvent && !pollTimer) {
        console.warn('[MP] Aucune réponse de RTDB, repli sur le polling REST.');
        startPolling();
      }
    }, RTDB_TIMEOUT_MS);

    // Base temps réel, chargée à la demande (voir firebase.js)
    getRtdb()
      .then(({ db, ref, onValue }) => {
        if (cancelled) return;
        unsubscribe = onValue(
          ref(db, rtdbSubPath),
          (snapshot) => { gotEvent = true; applyLiveState(roomId, snapshot.val()); },
          // Lecture refusée (règles RTDB, salle créée avant leur mise en place)
          // ou connexion perdue : on bascule sur le polling REST.
          (err) => {
            console.warn('[MP] Écoute RTDB interrompue, repli sur le polling REST :', err?.message);
            unsubscribe = null;
            if (!cancelled && !pollTimer) startPolling();
          },
        );
      })
      .catch((err) => {
        console.warn('[MP] RTDB indisponible, repli sur le polling REST :', err?.message);
        if (!cancelled && !pollTimer) startPolling();
      });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubscribe?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [roomId, myPlayerIndex, applyRoomState, applyLiveState]);

  // ── Délai d'inactivité de l'adversaire ────────────────────────
  const isActive = !!gameState && gameState.status !== 'FINISHED' && roomStatus !== 'FINISHED';
  const waitingForOpponent = isActive && !isMyTurn;
  useEffect(() => {
    if (!waitingForOpponent) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [waitingForOpponent]);

  const opponentIdleMs = waitingForOpponent && lastActionAt && now ? Math.max(0, now - lastActionAt) : 0;
  const canClaim = waitingForOpponent && opponentIdleMs >= claimAfterMs;
  //            ↑ myPlayerIndex ajouté : recrée le listener si le rôle change

  // ── Placement côté client (identique à useGameLogic) ──────────

  const handleDropTile = useCallback((rackIndex, r, c) => {
    if (!isMyTurn || !gameState) return;
    const grid = gameState.board.grid;
    if (grid[r][c] !== null) return;
    if (placements.find(p => p.r === r && p.c === c)) return;

    const tile = availableRackTiles[rackIndex];
    if (!tile) return;

    // Joker : on demande d'abord quelle lettre il représente
    if (tile.letter === '*') {
      setPendingJoker({ tile, r, c });
      return;
    }

    setPlacements(prev => [...prev, {
      letter: tile.letter,
      r, c,
      originalTile: tile,
      rackIndex,
    }]);
  }, [isMyTurn, gameState, placements, availableRackTiles]);

  /** Lettre choisie pour le joker : envoyée en minuscule (convention backend). */
  const chooseJokerLetter = useCallback((letter) => {
    if (!pendingJoker) return;
    const { tile, r, c } = pendingJoker;
    setPendingJoker(null);
    setPlacements(prev =>
      prev.some(p => (p.r === r && p.c === c) || p.originalTile === tile)
        ? prev
        : [...prev, { letter: letter.toLowerCase(), r, c, originalTile: tile }]
    );
  }, [pendingJoker]);

  const cancelJoker = useCallback(() => setPendingJoker(null), []);

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
      const msg = err?.response?.data?.detail || t('toast_word_invalid');
      addToast(msg, 'error');
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [roomId, placements, isMyTurn, applyRoomState, addToast, t]);

  const handlePassTurn = useCallback(async () => {
    if (!roomId || !isMyTurn) return;
    setIsLoading(true);
    try {
      const room = await mp.passTurn(roomId);
      applyRoomState(room);
      setPlacements([]);
    } catch (err) {
      addToast(err?.response?.data?.detail || t('toast_network_error'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, isMyTurn, applyRoomState, addToast, t]);

  const handleSwapTiles = useCallback(async () => {
    if (!roomId || !isMyTurn || selectedTilesToSwap.length === 0) return;
    setIsLoading(true);
    try {
      // B4 : convertir les indices de rack en lettres avant l'appel API.
      const lettersToSwap = selectedTilesToSwap
        .map(idx => myRack[idx]?.letter)
        .filter(Boolean);
      const room = await mp.swapTiles(roomId, lettersToSwap);
      applyRoomState(room);
      setSelectedTilesToSwap([]);
      setPlacements([]);
    } catch (err) {
      addToast(err?.response?.data?.detail || t('toast_swap_error'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, isMyTurn, selectedTilesToSwap, myRack, applyRoomState, addToast, t]);

  const handleResign = useCallback(async () => {
    if (!roomId) return;
    setIsLoading(true);
    try {
      applyRoomState(await mp.resign(roomId));
      setPlacements([]);
    } catch (err) {
      addToast(err?.response?.data?.detail || t('toast_network_error'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, applyRoomState, addToast, t]);

  const handleClaimWin = useCallback(async () => {
    if (!roomId) return;
    setIsLoading(true);
    try {
      applyRoomState(await mp.claimWin(roomId));
    } catch (err) {
      // 409 « encore N s » : l'horloge locale était en avance, on resynchronise
      addToast(err?.response?.data?.detail || t('toast_network_error'), 'error');
      mp.getRoom(roomId).then(applyRoomState).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [roomId, applyRoomState, addToast, t]);

  // Mélange : à tout moment, sans consommer le tour. Les tuiles posées reviennent
  // d'abord sur le chevalet (le nouvel ordre remplace les tuiles du chevalet).
  const handleShuffleRack = useCallback(async () => {
    if (!roomId || !isActive) return;
    setPlacements([]);
    setSelectedTilesToSwap([]);
    try {
      applyRoomState(await mp.shuffleRack(roomId));
    } catch (err) {
      addToast(err?.response?.data?.detail || t('toast_network_error'), 'error');
    }
  }, [roomId, isActive, applyRoomState, addToast, t]);

  // B4 : index de rack au lieu de la lettre — deux tuiles identiques sélectionnables indépendamment.
  const toggleTileForSwap = useCallback((rackIndex) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(rackIndex)
        ? prev.filter(i => i !== rackIndex)
        : [...prev, rackIndex]
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
    pendingJoker,
    opponentIdleMs,
    canClaim,

    // Actions placement
    handleDropTile,
    handleMoveTile,
    handleReturnTile,
    handleClearPlacements,
    chooseJokerLetter,
    cancelJoker,

    // Actions réseau
    handleValidateWord,
    handlePassTurn,
    handleSwapTiles,
    handleResign,
    handleClaimWin,
    handleShuffleRack,
    toggleTileForSwap,
  };
}
