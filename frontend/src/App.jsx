// src/App.jsx
// Routing hash-based + AuthProvider + GameApp complet avec Board, TileRack, ScorePanel

import React, { useState, useEffect, useCallback } from 'react';
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

// ── Router hash-based ─────────────────────────────────────────────

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
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

function Router() {
  const hash = useHashRoute();

  const renderPage = () => {
    if (hash === '#/login')       return <LoginPage />;
    if (hash === '#/register')    return <RegisterPage />;
    if (hash === '#/leaderboard') return <LeaderboardPage />;
    if (hash === '#/profile')     return (
      <ProtectedRoute><ProfilePage /></ProtectedRoute>
    );
    return (
      <ProtectedRoute requireCompleteProfile>
        <GameApp />
      </ProtectedRoute>
    );
  };

  return (
    <div>
      <Navbar />
      {renderPage()}
    </div>
  );
}

// ── Calcul score preview ──────────────────────────────────────────

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

// ── Game App ──────────────────────────────────────────────────────

const DIFFICULTIES = [
  { key: 'beginner', label: 'Débutant', emoji: '🐣', desc: 'Mots courts, beaucoup d\'erreurs' },
  { key: 'easy',     label: 'Facile',   emoji: '🟢', desc: 'Mots courts, ignore les bonus' },
  { key: 'medium',   label: 'Moyen',    emoji: '🟡', desc: 'Équilibré, quelques bonus' },
  { key: 'hard',     label: 'Expert',   emoji: '🔴', desc: 'Maximise chaque score' },
];

function GameApp() {
  const { user } = useAuth();

  // ── State ─────────────────────────────────────────────────────
  const [gameState, setGameState]           = useState(null);
  const [gameId, setGameId]                 = useState(null);
  const [placements, setPlacements]         = useState([]);
  const [selectedForSwap, setSelectedForSwap] = useState([]);
  const [isLoading, setIsLoading]           = useState(false);
  const [error, setError]                   = useState(null);
  const [showSwap, setShowSwap]             = useState(false);
  const [gameStartTime, setGameStartTime]   = useState(null);
  const [gameSaved, setGameSaved]           = useState(false);

  // ── Écran de démarrage : nom & difficulté ─────────────────────
  const [playerName, setPlayerName]   = useState('');
  const [difficulty, setDifficulty]   = useState('medium');

  // Pré-remplir le nom depuis le profil
  useEffect(() => {
    if (user?.display_name && !playerName) {
      setPlayerName(user.display_name);
    }
  }, [user]);

  // ── Dérivés ───────────────────────────────────────────────────
  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id
    : 0;

  const currentRack = gameState
    ? gameState.players.find(p => p.id === activePlayerId)?.rack ?? []
    : [];

  const placedOriginals = placements.map(p => p.originalTile);
  const availableRackTiles = currentRack.filter(t => !placedOriginals.includes(t));

  const previewScore = calculatePreviewScore(placements);

  const isAITurn = gameState
    ? gameState.players[gameState.current_player_index].is_ai
    : false;

  // ── Tour IA automatique ───────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId || !isAITurn) return;
    const timer = setTimeout(async () => {
      try {
        const updated = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail);
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [gameState, gameId, isAITurn]);

  // ── Sauvegarde auto fin de partie ────────────────────────────
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
  }, [gameState?.status]);

  // ── Actions ───────────────────────────────────────────────────

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    setPlacements([]);
    setSelectedForSwap([]);
    setShowSwap(false);
    setGameSaved(false);
    setGameStartTime(Date.now());
    try {
      const state = await gameService.startGame(
        [playerName.trim() || user?.display_name || 'Joueur', 'HAL 9000'],
        difficulty,
      );
      setGameState(state);
      setGameId(state.game_id);
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
    setPlacements(prev =>
      prev.map(p => p.r === fromR && p.c === fromC ? { ...p, r: toR, c: toC } : p)
    );
  }, [placements]);

  const handleReturnTile = useCallback((r, c) => {
    setPlacements(prev => prev.filter(p => !(p.r === r && p.c === c)));
  }, []);

  const handleValidate = async () => {
    if (!gameId || !placements.length) return;
    setIsLoading(true);
    try {
      const api = placements.map(p => [p.r, p.c, p.letter]);
      const result = await gameService.playWord(gameId, activePlayerId, api);
      setGameState(result);
      setPlacements([]);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Mot invalide ou placement illégal.');
      setPlacements([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePass = async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      setPlacements([]);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    }
  };

  const handleShuffle = async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.shuffleRack(gameId, activePlayerId);
      setGameState(updated);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    }
  };

  const handleSwapConfirm = async () => {
    if (!gameId || !selectedForSwap.length) return;
    setPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, activePlayerId, selectedForSwap);
      setGameState(updated);
      setSelectedForSwap([]);
      setShowSwap(false);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Échange impossible.');
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
          <button style={s.startBtn} onClick={() => { setGameState(null); setGameId(null); setPlacements([]); }}>
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
      {/* Header */}
      <div style={s.gameHeader}>
        <span style={s.gameTitle}>SCRABBLE</span>
        <span style={s.gameTurn}>
          Tour : <strong style={{ color: '#C8803A' }}>{currentPlayer.name}</strong>
          {isAITurn && ' ⏳'}
        </span>
        <span style={s.tilesLeft}>
          🎲 {gameState.remaining_tiles.length} tuiles
        </span>
      </div>

      <div style={s.gameLayout}>
        {/* Colonne gauche : scores + actions */}
        <div style={s.sidebar}>
          <ScorePanel
            players={gameState.players}
            currentPlayerId={activePlayerId}
            localUserId={user?.firebase_uid}
          />

          {/* Hint */}
          <div style={s.hint}>
            {isAITurn
              ? "L'IA réfléchit..."
              : placements.length > 0
              ? `${placements.length} tuile(s) posée(s) — score estimé : ${previewScore} pts`
              : 'Glissez une lettre sur le plateau'}
          </div>

          {/* Erreur */}
          {error && (
            <div style={s.errorBox} onClick={() => setError(null)} title="Cliquez pour fermer">
              ⚠ {error}
            </div>
          )}

          {/* Boutons d'action */}
          <div style={s.actions}>
            <button
              style={{ ...s.actionBtn, ...s.actionPrimary }}
              onClick={handleValidate}
              disabled={!placements.length || isAITurn || isLoading}
            >
              ✓ Valider ({placements.length})
            </button>
            <button
              style={s.actionBtn}
              onClick={handlePass}
              disabled={!!placements.length || isAITurn}
            >
              Passer
            </button>
            <button
              style={s.actionBtn}
              onClick={() => { setPlacements([]); setShowSwap(true); }}
              disabled={isAITurn || !!placements.length}
            >
              ⇄ Échanger
            </button>
            <button
              style={s.actionBtn}
              onClick={handleShuffle}
              disabled={isAITurn || !!placements.length}
            >
              ⇅ Mélanger
            </button>
          </div>

          {/* Panel échange */}
          {showSwap && (
            <div style={s.swapPanel}>
              <p style={s.swapTitle}>Sélectionnez les lettres à échanger</p>
              <TileRack
                tiles={availableRackTiles}
                playerId={activePlayerId}
                isSwapMode
                tilesSelectedForSwap={selectedForSwap}
                onSwapTilePress={toggleSwapTile}
                onTilePress={() => {}}
                selectedTile={null}
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
              <TileRack
                tiles={availableRackTiles}
                playerId={activePlayerId}
                selectedTile={null}
                onTilePress={() => {}}
                isSwapMode={false}
                tilesSelectedForSwap={[]}
                onSwapTilePress={() => {}}
              />
            </div>
          )}

          {isLoading && (
            <div style={s.loadingBar}>
              <div style={s.spinner} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s = {
  // Démarrage / Fin
  page: {
    minHeight: '100vh', background: '#F5EDD6',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  },
  startCard: {
    background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '4px',
    padding: '32px', maxWidth: '480px', width: '100%',
    boxShadow: '6px 6px 0 #C8803A',
  },
  endCard: {
    background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '4px',
    padding: '40px', maxWidth: '400px', width: '100%',
    boxShadow: '6px 6px 0 #C8803A', textAlign: 'center',
  },
  edition: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.2em',
    textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 4px', textAlign: 'center',
  },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: '3.5rem', fontWeight: 900,
    color: '#1E1A12', letterSpacing: '-0.04em', margin: '0', textAlign: 'center',
  },
  goldBar: { height: '3px', background: '#C8A830', margin: '10px auto', width: '80px', borderRadius: '2px' },
  subtitle: {
    fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: '0.9rem',
    color: '#5E6B3A', textAlign: 'center', margin: '0 0 24px',
  },
  section: { marginBottom: '20px' },
  sectionLabel: {
    display: 'block', fontFamily: "'DM Mono', monospace", fontSize: '0.6rem',
    letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8A7E65', marginBottom: '8px',
  },
  input: {
    width: '100%', fontFamily: "'DM Mono', monospace", fontSize: '0.9rem',
    color: '#1E1A12', background: '#EDE0C0', border: '2px solid #1E1A12',
    borderRadius: '2px', padding: '10px 12px', boxSizing: 'border-box', outline: 'none',
  },
  diffGrid: { display: 'flex', flexDirection: 'column', gap: '8px' },
  diffBtn: {
    display: 'flex', alignItems: 'center', gap: '12px',
    background: '#EDE0C0', border: '2px solid #8A7E65', borderRadius: '2px',
    padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
  },
  diffBtnActive: { background: '#1E1A12', borderColor: '#C8A830', boxShadow: '3px 3px 0 #8A6820' },
  diffEmoji: { fontSize: '1.2rem', flexShrink: 0 },
  diffLabel: {
    fontFamily: "'Playfair Display', serif", fontSize: '0.9rem', fontWeight: 700,
    color: '#1E1A12', marginBottom: '2px',
  },
  diffDesc: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: '#8A7E65', letterSpacing: '0.05em',
  },
  startBtn: {
    marginTop: '8px', width: '100%', background: '#5E6B3A', color: '#F5EDD6',
    border: '2px solid #3D4A20', borderRadius: '2px', padding: '14px',
    fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', fontWeight: 600,
    letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: '4px 4px 0 #2A3010',
  },
  scores: { margin: '20px 0' },
  scoreRow: {
    display: 'flex', justifyContent: 'space-between', padding: '8px 0',
    borderBottom: '1px solid #EDE0C0',
  },
  scoreName: { fontFamily: "'Playfair Display', serif", fontSize: '1rem', color: '#1E1A12' },
  scoreVal: { fontFamily: "'DM Mono', monospace", fontSize: '1rem', fontWeight: 700, color: '#C8A830' },
  winnerMsg: { fontFamily: "'Playfair Display', serif", fontSize: '1rem', color: '#5E6B3A', margin: '8px 0 20px' },

  // Jeu
  gamePage: { minHeight: '100vh', background: '#F5EDD6', display: 'flex', flexDirection: 'column' },
  gameHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', borderBottom: '3px solid #1E1A12', background: '#FFFBF0',
    flexWrap: 'wrap', gap: '8px',
  },
  gameTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 900,
    color: '#1E1A12', letterSpacing: '-0.03em',
  },
  gameTurn: { fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: '#8A7E65', letterSpacing: '0.05em' },
  tilesLeft: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65' },
  gameLayout: { display: 'flex', gap: '16px', padding: '16px', flex: 1, flexWrap: 'wrap' },
  sidebar: { display: 'flex', flexDirection: 'column', gap: '12px', width: '220px', flexShrink: 0 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 },
  hint: {
    background: '#EDE0C0', border: '1.5px solid rgba(200,168,48,0.4)', borderRadius: '2px',
    padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem',
    color: '#8A7E65', letterSpacing: '0.05em',
  },
  errorBox: {
    background: '#FFF0EE', border: '1.5px solid #8B2020', borderRadius: '2px',
    padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem',
    color: '#8B2020', cursor: 'pointer',
  },
  actions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  actionBtn: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', fontWeight: 500,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#1E1A12', background: 'transparent',
    border: '2px solid #1E1A12', borderRadius: '2px', padding: '9px 14px',
    cursor: 'pointer', boxShadow: '2px 2px 0 #8A7E65',
    transition: 'opacity 0.15s',
  },
  actionPrimary: {
    background: '#5E6B3A', color: '#F5EDD6',
    border: '2px solid #3D4A20', boxShadow: '2px 2px 0 #2A3010',
  },
  swapPanel: {
    background: '#FFFBF0', border: '2px solid #C8A830', borderRadius: '2px',
    padding: '14px',
  },
  swapTitle: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.1em',
    textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 10px',
  },
  rackWrap: { marginTop: '8px' },
  loadingBar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px' },
  spinner: {
    width: '24px', height: '24px', border: '3px solid #C8A830', borderTopColor: '#1E1A12',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
};