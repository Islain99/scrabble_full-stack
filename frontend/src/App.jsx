// src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import Board from './components/Board';
import TileRack from './components/TileRack';
import ScorePanel from './components/ScorePanel';
import * as gameService from './api/gameService';
import { saveGame } from './api/authService';
import './index.css';
import { POINTS_LETTRES, BONUS_MAP } from './data/constants';

// ── Router ────────────────────────────────────────────────────────

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

export default function App() {
  return <AuthProvider><Router /></AuthProvider>;
}

function Router() {
  const hash = useHashRoute();
  const renderPage = () => {
    if (hash === '#/login')       return <LoginPage />;
    if (hash === '#/register')    return <RegisterPage />;
    if (hash === '#/leaderboard') return <LeaderboardPage />;
    if (hash === '#/profile')     return <ProtectedRoute><ProfilePage /></ProtectedRoute>;
    return <ProtectedRoute requireCompleteProfile><GameApp /></ProtectedRoute>;
  };
  return <div><Navbar />{renderPage()}</div>;
}

// ── Score preview ─────────────────────────────────────────────────

function calculatePreviewScore(placements) {
  if (!placements.length) return 0;
  let score = 0, wordMultiplier = 1;
  placements.forEach(p => {
    let ls = POINTS_LETTRES[p.letter] || 0;
    const bonus = BONUS_MAP?.[`${p.r}-${p.c}`];
    if (bonus === 'DL') ls *= 2;
    if (bonus === 'TL') ls *= 3;
    if (bonus === 'DM') wordMultiplier *= 2;
    if (bonus === 'TM') wordMultiplier *= 3;
    if (p.r === 7 && p.c === 7) wordMultiplier *= 2;
    score += ls;
  });
  return score * wordMultiplier;
}

// ── Difficulté ────────────────────────────────────────────────────

const DIFFICULTIES = [
  { key: 'beginner', label: 'Débutant', emoji: '🐣', desc: "Mots courts, beaucoup d'erreurs" },
  { key: 'easy',     label: 'Facile',   emoji: '🟢', desc: 'Mots courts, ignore les bonus' },
  { key: 'medium',   label: 'Moyen',    emoji: '🟡', desc: 'Équilibré, quelques bonus' },
  { key: 'hard',     label: 'Expert',   emoji: '🔴', desc: 'Maximise chaque score' },
];

// ── GameApp ───────────────────────────────────────────────────────

function GameApp() {
  const { user } = useAuth();

  const [gameState, setGameState]             = useState(null);
  const [gameId, setGameId]                   = useState(null);
  const [placements, setPlacements]           = useState([]);
  const [selectedForSwap, setSelectedForSwap] = useState([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState(null);
  const [showSwap, setShowSwap]               = useState(false);
  const [gameStartTime, setGameStartTime]     = useState(null);
  const [gameSaved, setGameSaved]             = useState(false);
  const [playerName, setPlayerName]           = useState('');
  const [difficulty, setDifficulty]           = useState('medium');

  // FIX: id stable du joueur humain — ne change pas quand l'IA joue
  const [humanPlayerId, setHumanPlayerId] = useState(0);

  // Verrou contre les doubles appels humains (ref = pas de re-render)
  const actionInFlight = useRef(false);

  // État dédié au tour IA — state React (pas une ref) pour bloquer l'UI proprement
  const [isAIThinking, setIsAIThinking] = useState(false);

  useEffect(() => {
    if (user?.display_name && !playerName) setPlayerName(user.display_name);
  }, [user]);

  // ── Dérivés ───────────────────────────────────────────────────
  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id : 0;

  const currentRack = gameState
    ? gameState.players.find(p => p.id === activePlayerId)?.rack ?? [] : [];

  const placedOriginals    = placements.map(p => p.originalTile);
  const availableRackTiles = currentRack.filter(t => !placedOriginals.includes(t));
  const previewScore       = calculatePreviewScore(placements);

  const isAITurn = gameState
    ? gameState.players[gameState.current_player_index].is_ai : false;

  // isBlocked = tour IA en cours OU requête humaine en vol OU chargement
  const isBlocked = isAIThinking || isLoading;

  const hint = isAIThinking
    ? "⏳ L'IA réfléchit..."
    : isLoading
      ? '⏳ Traitement...'
      : placements.length > 0
        ? `${placements.length} tuile(s) — score estimé : ${previewScore} pts`
        : 'Glissez une lettre sur le plateau';

  // ── Tour IA ───────────────────────────────────────────────────
  // isAIThinking est un state React (pas une ref) pour bloquer l'UI immédiatement.
  // Dépendances minimales [isAITurn, gameId] : seuls ces deux éléments
  // déterminent si l'IA doit jouer — évite les re-triggers sur chaque render.
  const aiTimerRef = useRef(null);

  useEffect(() => {
    // Nettoyer le timer précédent si présent
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    if (!isAITurn || !gameId || !gameState || gameState.status !== 'ACTIVE') {
      return;
    }

    // Marquer immédiatement comme "IA en train de réfléchir"
    // pour bloquer les boutons avant même que le timer parte
    setIsAIThinking(true);

    aiTimerRef.current = setTimeout(async () => {
      try {
        const updated = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail || e.message);
      } finally {
        aiTimerRef.current = null;
        setIsAIThinking(false);
      }
    }, 1200);

    // Pas de cleanup qui met isAIThinking=false : si le composant re-render
    // (ex: changement mineur d'état) on ne veut pas annuler un appel déjà lancé.
    // Le cleanup nettoie seulement le timer non encore parti.
    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
        setIsAIThinking(false); // annulé avant d'être parti → relâcher le verrou
      }
    };
  }, [isAITurn, gameId]); // dépendances minimales et stables

  // ── Sauvegarde fin de partie ──────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'FINISHED' || gameSaved || !user) return;
    const human = gameState.players.find(p => !p.is_ai);
    const ai    = gameState.players.find(p => p.is_ai);
    if (!human) return;
    setGameSaved(true);
    saveGame({
      game_id:          gameId || `game_${Date.now()}`,
      user_score:       human.score,
      ai_name:          ai?.name || 'HAL 9000',
      ai_score:         ai?.score || 0,
      ai_difficulty:    difficulty,
      won:              human.score > (ai?.score ?? 0),
      duration_seconds: gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null,
      turns_count:      gameState.passes_count || 0,
    }).catch(console.error);
  }, [gameState?.status, gameId, difficulty, gameStartTime, user, gameSaved]);

  // ── Actions ───────────────────────────────────────────────────

  const handleStart = async () => {
    if (actionInFlight.current) return;
    setIsLoading(true);
    setError(null);
    setPlacements([]);
    setSelectedForSwap([]);
    setShowSwap(false);
    setGameSaved(false);
    setGameStartTime(Date.now());
    actionInFlight.current = false;
    setIsAIThinking(false);
    if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
    try {
      const state = await gameService.startGame(
        [playerName.trim() || user?.display_name || 'Joueur', 'HAL 9000'],
        difficulty,
      );
      setGameState(state);
      setGameId(state.game_id);
      // FIX: mémoriser l'id du joueur humain une fois pour toutes
      const human = state.players.find(p => !p.is_ai);
      setHumanPlayerId(human?.id ?? 0);
    } catch (e) {
      setError('Impossible de démarrer la partie. Vérifiez votre connexion.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDropTile = useCallback((rackIndex, r, c) => {
    const tile = availableRackTiles[rackIndex];
    if (!tile) return;
    if (placements.some(p => p.r === r && p.c === c)) return;
    setPlacements(prev => [...prev, { letter: tile.letter, r, c, originalTile: tile, rackIndex }]);
  }, [availableRackTiles, placements]);

  const handleMoveTile = useCallback((fromR, fromC, toR, toC) => {
    if (placements.some(p => p.r === toR && p.c === toC)) return;
    setPlacements(prev => prev.map(p =>
      p.r === fromR && p.c === fromC ? { ...p, r: toR, c: toC } : p
    ));
  }, [placements]);

  const handleReturnTile = useCallback((r, c) => {
    setPlacements(prev => prev.filter(p => !(p.r === r && p.c === c)));
  }, []);

  const handleValidate = async () => {
    if (!gameId || !placements.length || actionInFlight.current) return;
    actionInFlight.current = true;
    setIsLoading(true);
    try {
      const api = placements.map(p => [p.r, p.c, p.letter]);
      // FIX: humanPlayerId au lieu de activePlayerId
      const result = await gameService.playWord(gameId, humanPlayerId, api);
      setGameState(result);
      setPlacements([]);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Mot invalide ou placement illégal.');
      setPlacements([]);
    } finally {
      setIsLoading(false);
      actionInFlight.current = false;
    }
  };

  const handlePass = async () => {
    if (!gameId || actionInFlight.current) return;
    actionInFlight.current = true;
    setIsLoading(true);
    try {
      // FIX: humanPlayerId + setIsLoading (manquait dans la version originale)
      const updated = await gameService.passTurn(gameId, humanPlayerId);
      setGameState(updated);
      setPlacements([]);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    } finally {
      setIsLoading(false);
      actionInFlight.current = false;
    }
  };

  const handleShuffle = async () => {
    if (!gameId || actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      const updated = await gameService.shuffleRack(gameId, humanPlayerId);
      setGameState(updated);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    } finally {
      actionInFlight.current = false;
    }
  };

  const handleSwapConfirm = async () => {
    if (!gameId || !selectedForSwap.length || actionInFlight.current) return;
    actionInFlight.current = true;
    setIsLoading(true);
    setPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, humanPlayerId, selectedForSwap);
      setGameState(updated);
      setSelectedForSwap([]);
      setShowSwap(false);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Échange impossible.');
    } finally {
      setIsLoading(false);
      actionInFlight.current = false;
    }
  };

  const toggleSwapTile = (letter) => {
    setSelectedForSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  };

  // ── Écran démarrage ───────────────────────────────────────────
  if (!gameState || gameState.status === 'SETUP') {
    return (
      <div style={s.page}>
        <div style={s.startCard}>
          <p style={s.edition}>Édition de Luxe — 1972</p>
          <h1 style={s.title}>SCRABBLE</h1>
          <div style={s.goldBar} />
          <p style={s.subtitle}>Le jeu classique des mots croisés</p>

          <div style={s.section}>
            <label style={s.sectionLabel}>Votre nom</label>
            <input
              style={s.input}
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Joueur 1"
              maxLength={20}
            />
          </div>

          <div style={s.section}>
            <label style={s.sectionLabel}>Difficulté de l'IA</label>
            <div style={s.diffGrid}>
              {DIFFICULTIES.map(d => (
                <button
                  key={d.key}
                  style={{ ...s.diffBtn, ...(difficulty === d.key ? s.diffBtnActive : {}) }}
                  onClick={() => setDifficulty(d.key)}
                >
                  <span style={s.diffEmoji}>{d.emoji}</span>
                  <div>
                    <div style={{ ...s.diffLabel, ...(difficulty === d.key ? { color: '#F5EDD6' } : {}) }}>
                      {d.label}
                    </div>
                    <div style={{ ...s.diffDesc, ...(difficulty === d.key ? { color: 'rgba(245,237,214,0.7)' } : {}) }}>
                      {d.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button style={s.startBtn} onClick={handleStart} disabled={isLoading}>
            {isLoading ? 'Démarrage...' : 'Démarrer la partie'}
          </button>
        </div>
      </div>
    );
  }

  // ── Écran de fin ──────────────────────────────────────────────
  if (gameState.status === 'FINISHED') {
    const human = gameState.players.find(p => !p.is_ai);
    const ai    = gameState.players.find(p => p.is_ai);
    const won   = human?.score > (ai?.score ?? 0);
    return (
      <div style={s.page}>
        <div style={s.endCard}>
          <h2 style={{ ...s.title, fontSize: '2rem' }}>
            {won ? '🏆 Victoire !' : '😔 Défaite'}
          </h2>
          <div style={s.goldBar} />
          <div style={s.scores}>
            {gameState.players.map(p => (
              <div key={p.id} style={s.scoreRow}>
                <span style={s.scoreName}>{p.name}</span>
                <span style={s.scoreVal}>{p.score} pts</span>
              </div>
            ))}
          </div>
          {gameState.winner_name && (
            <p style={s.winnerMsg}>Gagnant : <strong>{gameState.winner_name}</strong></p>
          )}
          <button style={s.startBtn} onClick={() => {
            setGameState(null); setGameId(null); setPlacements([]);
            setGameSaved(false); setIsAIThinking(false); actionInFlight.current = false;
            if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
          }}>
            Rejouer
          </button>
        </div>
      </div>
    );
  }

  // ── Écran de jeu ──────────────────────────────────────────────
  const currentPlayer = gameState.players[gameState.current_player_index];

  return (
    <div style={s.gamePage}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.gameHeader}>
        <span style={s.gameTitle}>SCRABBLE</span>
        <span style={s.gameTurn}>
          Tour : <strong style={{ color: '#C8803A' }}>{currentPlayer.name}</strong>
          {isAITurn && ' ⏳'}
        </span>
        <span style={s.tilesLeft}>🎲 {gameState.remaining_tiles.length} tuiles</span>
      </div>

      <div style={s.gameLayout}>
        {/* Sidebar gauche */}
        <div style={s.sidebar}>
          <ScorePanel
            players={gameState.players}
            currentPlayerId={activePlayerId}
            localUserId={user?.firebase_uid}
          />

          <div style={s.hint}>{hint}</div>

          {error && (
            <div style={s.errorBox} onClick={() => setError(null)} title="Cliquez pour fermer">
              ⚠ {error}
            </div>
          )}

          <div style={s.actions}>
            <button
              style={{ ...s.actionBtn, ...s.actionPrimary }}
              onClick={handleValidate}
              disabled={!placements.length || isBlocked}
            >
              ✓ Valider ({placements.length})
            </button>
            <button
              style={s.actionBtn}
              onClick={handlePass}
              disabled={!!placements.length || isBlocked}
            >
              Passer
            </button>
            <button
              style={s.actionBtn}
              onClick={() => { setPlacements([]); setShowSwap(true); }}
              disabled={isBlocked || !!placements.length}
            >
              ⇄ Échanger
            </button>
            <button
              style={s.actionBtn}
              onClick={handleShuffle}
              disabled={isBlocked || !!placements.length}
            >
              ⇅ Mélanger
            </button>
          </div>

          {showSwap && (
            <div style={s.swapPanel}>
              <p style={s.swapTitle}>Sélectionnez les lettres à échanger</p>
              {/* FIX: props alignées avec la nouvelle interface TileRack */}
              <TileRack
                tiles={availableRackTiles}
                playerId={humanPlayerId}
                isSwapMode={true}
                tilesSelectedForSwap={selectedForSwap}
                onSwapTilePress={toggleSwapTile}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button style={s.actionBtn} onClick={() => { setShowSwap(false); setSelectedForSwap([]); }}>
                  Annuler
                </button>
                <button
                  style={{ ...s.actionBtn, ...s.actionPrimary }}
                  onClick={handleSwapConfirm}
                  disabled={!selectedForSwap.length}
                >
                  Échanger ({selectedForSwap.length})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Centre : plateau + rack */}
        <div style={s.center}>
          <Board
            gameState={gameState}
            placements={placements}
            onDropTile={handleDropTile}
            onMoveTile={handleMoveTile}
            onReturnTile={handleReturnTile}
          />

          {!isAITurn && !showSwap && (
            <div style={s.rackWrap}>
              {/* FIX: props alignées avec la nouvelle interface TileRack */}
              <TileRack
                tiles={availableRackTiles}
                playerId={humanPlayerId}
                isSwapMode={false}
                tilesSelectedForSwap={[]}
                onSwapTilePress={() => {}}
              />
            </div>
          )}

          {(isLoading || isAIThinking) && (
            <div style={s.loadingBar}>
              <div style={s.spinner} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65' }}>
                {isAIThinking ? "L'IA réfléchit..." : 'Traitement...'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: '#F5EDD6' },
  startCard: { width: '100%', maxWidth: '480px', background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '2px', padding: '2.5rem', boxShadow: '8px 8px 0 #C8803A' },
  endCard:   { width: '100%', maxWidth: '360px', background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '2px', padding: '2rem', boxShadow: '8px 8px 0 #C8803A', textAlign: 'center' },
  edition: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 8px' },
  title: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '3.5rem', fontWeight: 900, color: '#1E1A12', letterSpacing: '-0.04em', margin: 0 },
  goldBar: { height: '4px', background: '#C8803A', borderRadius: '2px', margin: '12px 0', width: '80px' },
  subtitle: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 2rem' },
  section: { marginBottom: '1.5rem' },
  sectionLabel: { display: 'block', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' },
  input: { width: '100%', fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', background: '#F5EDD6', border: '2px solid #C8A830', borderRadius: '2px', padding: '10px 12px', color: '#1E1A12', outline: 'none', boxSizing: 'border-box' },
  diffGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  diffBtn: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'transparent', border: '2px solid #C8A830', borderRadius: '2px', cursor: 'pointer', textAlign: 'left' },
  diffBtnActive: { background: '#1E1A12', borderColor: '#C8A830', boxShadow: '3px 3px 0 #8A6820' },
  diffEmoji: { fontSize: '1.4rem' },
  diffLabel: { fontFamily: "'Playfair Display', serif", fontSize: '0.85rem', fontWeight: 700, color: '#1E1A12' },
  diffDesc: { fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', color: '#8A7E65', letterSpacing: '0.05em', marginTop: '2px' },
  startBtn: { width: '100%', fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F5EDD6', background: '#5E6B3A', border: '3px solid #3D4A20', borderRadius: '2px', padding: '14px', cursor: 'pointer', boxShadow: '4px 4px 0 #2A3010', marginTop: '1rem' },
  scores: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '1rem 0' },
  scoreRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#EDE0C0', borderRadius: '2px', border: '1px solid #C8A830' },
  scoreName: { fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#1E1A12' },
  scoreVal: { fontFamily: "'DM Mono', monospace", fontSize: '1rem', fontWeight: 700, color: '#5E6B3A' },
  winnerMsg: { fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: '#5A4A30', margin: '0 0 1rem' },
  gamePage: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 52px)', background: '#F5EDD6' },
  gameHeader: { display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 20px', background: '#1E1A12', borderBottom: '2px solid #C8A830' },
  gameTitle: { fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 900, color: '#C8A830', letterSpacing: '-0.02em' },
  gameTurn: { fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#8A7E65', letterSpacing: '0.05em', flex: 1 },
  tilesLeft: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65' },
  gameLayout: { display: 'flex', gap: '16px', padding: '16px', flex: 1, flexWrap: 'wrap' },
  sidebar: { display: 'flex', flexDirection: 'column', gap: '12px', width: '220px', flexShrink: 0 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 },
  hint: { background: '#EDE0C0', border: '1.5px solid rgba(200,168,48,0.4)', borderRadius: '2px', padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65', letterSpacing: '0.05em' },
  errorBox: { background: '#FFF0EE', border: '1.5px solid #8B2020', borderRadius: '2px', padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8B2020', cursor: 'pointer' },
  actions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  actionBtn: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1E1A12', background: 'transparent', border: '2px solid #1E1A12', borderRadius: '2px', padding: '9px 14px', cursor: 'pointer', boxShadow: '2px 2px 0 #8A7E65', transition: 'opacity 0.15s' },
  actionPrimary: { background: '#5E6B3A', color: '#F5EDD6', border: '2px solid #3D4A20', boxShadow: '2px 2px 0 #2A3010' },
  swapPanel: { background: '#FFFBF0', border: '2px solid #C8A830', borderRadius: '2px', padding: '14px' },
  swapTitle: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 10px' },
  rackWrap: { marginTop: '8px' },
  loadingBar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px' },
  spinner: { width: '24px', height: '24px', border: '3px solid #C8A830', borderTopColor: '#1E1A12', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
};