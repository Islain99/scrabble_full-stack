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
    const h = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return hash;
}

export default function App() {
  return <AuthProvider><Router /></AuthProvider>;
}

function Router() {
  const hash = useHashRoute();
  if (hash === '#/login')       return <><Navbar /><LoginPage /></>;
  if (hash === '#/register')    return <><Navbar /><RegisterPage /></>;
  if (hash === '#/leaderboard') return <><Navbar /><LeaderboardPage /></>;
  if (hash === '#/profile')     return <><Navbar /><ProtectedRoute><ProfilePage /></ProtectedRoute></>;
  return <><Navbar /><ProtectedRoute requireCompleteProfile><GameApp /></ProtectedRoute></>;
}

// ── Helpers ───────────────────────────────────────────────────────

function calcPreviewScore(placements) {
  if (!placements.length) return 0;
  let score = 0, wm = 1;
  for (const p of placements) {
    let ls = POINTS_LETTRES[p.letter] || 0;
    const b = BONUS_MAP?.[`${p.r}-${p.c}`];
    if (b === 'DL') ls *= 2;
    if (b === 'TL') ls *= 3;
    if (b === 'DM') wm *= 2;
    if (b === 'TM') wm *= 3;
    if (p.r === 7 && p.c === 7) wm *= 2;
    score += ls;
  }
  return score * wm;
}

const DIFFICULTIES = [
  { key: 'beginner', label: 'Débutant', emoji: '🐣', desc: "Mots courts, beaucoup d'erreurs" },
  { key: 'easy',     label: 'Facile',   emoji: '🟢', desc: 'Mots courts, ignore les bonus' },
  { key: 'medium',   label: 'Moyen',    emoji: '🟡', desc: 'Équilibré, quelques bonus' },
  { key: 'hard',     label: 'Expert',   emoji: '🔴', desc: 'Maximise chaque score' },
];

// ── GameApp ───────────────────────────────────────────────────────

function GameApp() {
  const { user } = useAuth();

  const [gameState,       setGameState]       = useState(null);
  const [gameId,          setGameId]          = useState(null);
  const [placements,      setPlacements]      = useState([]);
  const [selectedForSwap, setSelectedForSwap] = useState([]);
  const [showSwap,        setShowSwap]        = useState(false);
  const [error,           setError]           = useState(null);
  const [isLoading,       setIsLoading]       = useState(false);
  const [isAIThinking,    setIsAIThinking]    = useState(false);
  const [gameStartTime,   setGameStartTime]   = useState(null);
  const [gameSaved,       setGameSaved]       = useState(false);
  const [playerName,      setPlayerName]      = useState('');
  const [difficulty,      setDifficulty]      = useState('medium');
  const [humanPlayerId,   setHumanPlayerId]   = useState(0);

  // Refs synchrones — jamais de fenêtre de re-render
  const aiRunning = useRef(false);  // verrou pour le tour IA
  const humanLock = useRef(false);  // verrou pour les actions humaines

  useEffect(() => {
    if (user?.display_name && !playerName) setPlayerName(user.display_name);
  }, [user]);

  // ── Dérivés synchrones depuis gameState ──────────────────────
  const currentIndex   = gameState?.current_player_index ?? 0;
  const currentPlayer  = gameState?.players[currentIndex];
  const isAITurn       = currentPlayer?.is_ai ?? false;
  const activePlayerId = currentPlayer?.id ?? 0;

  // isHumanTurn : basé uniquement sur gameState — toujours synchrone avec le backend
  const isHumanTurn = gameState?.status === 'ACTIVE' && !isAITurn;

  const currentRack        = gameState?.players.find(p => p.id === activePlayerId)?.rack ?? [];
  const placedOriginals    = placements.map(p => p.originalTile);
  const availableRackTiles = currentRack.filter(t => !placedOriginals.includes(t));
  const previewScore       = calcPreviewScore(placements);

  // isBlocked couvre tous les cas : tour IA, requête en cours, loading
  const isBlocked = !isHumanTurn || isLoading || isAIThinking;

  // ── Sauvegarde fin de partie ─────────────────────────────────
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

  // ── Tour IA ───────────────────────────────────────────────────
  // runAITurn : pas de dépendances dans useCallback — utilise uniquement des refs
  // et des setters stables pour éviter les closures périmées.
  const runAITurn = useCallback(async (gid) => {
    // Verrou ref synchrone — garanti même entre deux renders
    if (aiRunning.current) return;
    aiRunning.current = true;
    setIsAIThinking(true);
    try {
      const updated = await gameService.aiPlayTurn(gid);
      setGameState(updated);
    } catch (e) {
      console.error('Erreur IA:', e?.response?.data?.detail || e.message);
      // Resync depuis le serveur pour ne pas rester bloqué
      try {
        const synced = await gameService.getGameStatus(gid);
        setGameState(synced);
      } catch { /* conserver l'état actuel si le status échoue aussi */ }
    } finally {
      aiRunning.current = false;
      setIsAIThinking(false);
    }
  }, []); // [] — stable, n'a pas besoin de dépendances (pas de closure sur du state)

  // Guard de secours : déclenche le tour IA si on arrive sur un état
  // isAITurn=true sans l'avoir lancé (refresh page, reconnexion réseau).
  // N'est PAS la voie principale — c'est runAITurn() appelé explicitement
  // depuis les handlers qui gère le cas normal.
  useEffect(() => {
    if (!isAITurn || !gameId || gameState?.status !== 'ACTIVE') return;
    if (aiRunning.current) return; // déjà lancé par un handler
    runAITurn(gameId);
  }, [isAITurn, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── handleStart ───────────────────────────────────────────────
  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    setPlacements([]);
    setSelectedForSwap([]);
    setShowSwap(false);
    setGameSaved(false);
    setIsAIThinking(false);
    aiRunning.current  = false;
    humanLock.current  = false;
    setGameStartTime(Date.now());
    try {
      const state = await gameService.startGame(
        [playerName.trim() || user?.display_name || 'Joueur', 'HAL 9000'],
        difficulty,
      );
      setGameState(state);
      setGameId(state.game_id);
      setHumanPlayerId(state.players.find(p => !p.is_ai)?.id ?? 0);
    } catch {
      setError('Impossible de démarrer. Vérifiez votre connexion.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Drag-and-drop ─────────────────────────────────────────────
  const handleDropTile = useCallback((rackIndex, r, c) => {
    const tile = availableRackTiles[rackIndex];
    if (!tile || placements.some(p => p.r === r && p.c === c)) return;
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

  // ── Actions humaines ──────────────────────────────────────────
  // Ordre des gardes :
  //   1. isHumanTurn   — synchrone depuis gameState, bloque si tour IA
  //   2. humanLock.current — ref synchrone, bloque les doubles clics
  //   3. setIsLoading  — état React pour l'UI
  //   4. appel backend
  //   5. si le prochain joueur est l'IA → runAITurn() immédiatement
  //   6. finally → libérer le lock

  const handleValidate = async () => {
    if (!gameId || !placements.length || !isHumanTurn || humanLock.current) return;
    humanLock.current = true;
    setIsLoading(true);
    try {
      const coords = placements.map(p => [p.r, p.c, p.letter]);
      const result = await gameService.playWord(gameId, humanPlayerId, coords);
      setGameState(result);
      setPlacements([]);
      setError(null);
      if (result.players[result.current_player_index]?.is_ai && result.status === 'ACTIVE') {
        runAITurn(result.game_id);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Mot invalide ou placement illégal.');
    } finally {
      setIsLoading(false);
      humanLock.current = false;
    }
  };

  const handlePass = async () => {
    if (!gameId || !isHumanTurn || humanLock.current) return;
    humanLock.current = true;
    setIsLoading(true);
    try {
      const result = await gameService.passTurn(gameId, humanPlayerId);
      setGameState(result);
      setPlacements([]);
      setError(null);
      if (result.players[result.current_player_index]?.is_ai && result.status === 'ACTIVE') {
        runAITurn(result.game_id);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    } finally {
      setIsLoading(false);
      humanLock.current = false;
    }
  };

  const handleShuffle = async () => {
    if (!gameId || !isHumanTurn || humanLock.current) return;
    humanLock.current = true;
    try {
      const result = await gameService.shuffleRack(gameId, humanPlayerId);
      setGameState(result);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur réseau.');
    } finally {
      humanLock.current = false;
    }
  };

  const handleSwapConfirm = async () => {
    if (!gameId || !selectedForSwap.length || !isHumanTurn || humanLock.current) return;
    humanLock.current = true;
    setIsLoading(true);
    setPlacements([]);
    try {
      const result = await gameService.swapTiles(gameId, humanPlayerId, selectedForSwap);
      setGameState(result);
      setSelectedForSwap([]);
      setShowSwap(false);
      setError(null);
      if (result.players[result.current_player_index]?.is_ai && result.status === 'ACTIVE') {
        runAITurn(result.game_id);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Échange impossible.');
    } finally {
      setIsLoading(false);
      humanLock.current = false;
    }
  };

  const toggleSwapTile = (letter) =>
    setSelectedForSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );

  // ── Écran démarrage ───────────────────────────────────────────
  if (!gameState || gameState.status === 'SETUP') {
    return (
      <div style={S.page}>
        <div style={S.startCard}>
          <p style={S.edition}>Édition de Luxe — 1972</p>
          <h1 style={S.title}>SCRABBLE</h1>
          <div style={S.goldBar} />
          <p style={S.subtitle}>Le jeu classique des mots croisés</p>
          <div style={S.section}>
            <label style={S.sectionLabel}>Votre nom</label>
            <input style={S.input} value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Joueur 1" maxLength={20} />
          </div>
          <div style={S.section}>
            <label style={S.sectionLabel}>Difficulté de l'IA</label>
            <div style={S.diffGrid}>
              {DIFFICULTIES.map(d => (
                <button key={d.key}
                  style={{ ...S.diffBtn, ...(difficulty === d.key ? S.diffBtnActive : {}) }}
                  onClick={() => setDifficulty(d.key)}>
                  <span style={S.diffEmoji}>{d.emoji}</span>
                  <div>
                    <div style={{ ...S.diffLabel, ...(difficulty === d.key ? { color: '#F5EDD6' } : {}) }}>{d.label}</div>
                    <div style={{ ...S.diffDesc, ...(difficulty === d.key ? { color: 'rgba(245,237,214,0.7)' } : {}) }}>{d.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button style={S.startBtn} onClick={handleStart} disabled={isLoading}>
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
      <div style={S.page}>
        <div style={S.endCard}>
          <h2 style={{ ...S.title, fontSize: '2rem' }}>{won ? '🏆 Victoire !' : '😔 Défaite'}</h2>
          <div style={S.goldBar} />
          <div style={S.scores}>
            {gameState.players.map(p => (
              <div key={p.id} style={S.scoreRow}>
                <span style={S.scoreName}>{p.name}</span>
                <span style={S.scoreVal}>{p.score} pts</span>
              </div>
            ))}
          </div>
          {gameState.winner_name && <p style={S.winnerMsg}>Gagnant : <strong>{gameState.winner_name}</strong></p>}
          <button style={S.startBtn} onClick={() => {
            setGameState(null); setGameId(null); setPlacements([]);
            setIsAIThinking(false); setGameSaved(false);
            aiRunning.current = false; humanLock.current = false;
          }}>Rejouer</button>
        </div>
      </div>
    );
  }

  // ── Écran de jeu ──────────────────────────────────────────────
  const hint = isLoading
    ? '⏳ Traitement...'
    : placements.length > 0
      ? `${placements.length} tuile(s) — score estimé : ${previewScore} pts`
      : 'Glissez une lettre sur le plateau';

  return (
    <div style={S.gamePage}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { left: -60%; } 100% { left: 120%; } }
        @keyframes dot     { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.3; transform:scale(.55); } }
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>SCRABBLE</span>
        <span style={S.headerTurn}>
          Tour : <strong style={{ color: isAITurn ? '#C8A830' : '#C8803A' }}>
            {currentPlayer?.name}
          </strong>
        </span>
        {isAITurn && (
          <div style={S.headerDots}>
            {[0,150,300].map(d => (
              <div key={d} style={{ ...S.dot, animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        <span style={S.headerTiles}>🎲 {gameState.remaining_tiles.length}</span>
      </div>

      {/* Bannière IA — basée sur isAITurn (synchrone) pas isAIThinking */}
      {isAITurn && (
        <div style={S.aiBanner}>
          <div style={S.aiSpinner} />
          <div style={{ flex: 1 }}>
            <div style={S.aiBannerTitle}>HAL 9000 réfléchit...</div>
            <div style={S.aiBannerSub}>
              {isAIThinking ? 'Calcul en cours' : 'Connexion...'}
            </div>
          </div>
          {/* Barre de progression */}
          <div style={S.progressTrack}>
            <div style={S.progressBar} />
          </div>
        </div>
      )}

      {/* Layout */}
      <div style={S.layout}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <ScorePanel
            players={gameState.players}
            currentPlayerId={activePlayerId}
            localUserId={user?.firebase_uid}
          />

          {/* Hint — couleur différente si tour IA */}
          <div style={{ ...S.hint, ...(isAITurn ? S.hintAI : {}) }}>
            {isAITurn ? '⏳ Calcul du coup IA...' : hint}
          </div>

          {error && (
            <div style={S.errorBox} onClick={() => setError(null)}>⚠ {error}</div>
          )}

          <div style={S.actions}>
            <button style={{ ...S.btn, ...S.btnPrimary }}
              onClick={handleValidate}
              disabled={!placements.length || isBlocked}>
              ✓ Valider ({placements.length})
            </button>
            <button style={S.btn} onClick={handlePass}
              disabled={!!placements.length || isBlocked}>
              Passer
            </button>
            <button style={S.btn}
              onClick={() => { setPlacements([]); setShowSwap(true); }}
              disabled={isBlocked || !!placements.length}>
              ⇄ Échanger
            </button>
            <button style={S.btn} onClick={handleShuffle}
              disabled={isBlocked || !!placements.length}>
              ⇅ Mélanger
            </button>
          </div>

          {showSwap && (
            <div style={S.swapPanel}>
              <p style={S.swapTitle}>Sélectionnez les lettres à échanger</p>
              <TileRack
                tiles={availableRackTiles}
                playerId={humanPlayerId}
                isSwapMode={true}
                tilesSelectedForSwap={selectedForSwap}
                onSwapTilePress={toggleSwapTile}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button style={S.btn} onClick={() => { setShowSwap(false); setSelectedForSwap([]); }}>
                  Annuler
                </button>
                <button style={{ ...S.btn, ...S.btnPrimary }}
                  onClick={handleSwapConfirm}
                  disabled={!selectedForSwap.length}>
                  Échanger ({selectedForSwap.length})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Centre — plateau + rack */}
        <div style={S.center}>
          <Board
            gameState={gameState}
            placements={placements}
            onDropTile={handleDropTile}
            onMoveTile={handleMoveTile}
            onReturnTile={handleReturnTile}
          />

          {isHumanTurn && !showSwap && (
            <div style={S.rackWrap}>
              <TileRack
                tiles={availableRackTiles}
                playerId={humanPlayerId}
                isSwapMode={false}
                tilesSelectedForSwap={[]}
                onSwapTilePress={() => {}}
              />
            </div>
          )}

          {isLoading && (
            <div style={S.loadingRow}>
              <div style={S.spinner} /><span style={S.loadingText}>Traitement...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const S = {
  page:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: '#F5EDD6' },
  startCard: { width: '100%', maxWidth: '480px', background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '2px', padding: '2.5rem', boxShadow: '8px 8px 0 #C8803A' },
  endCard:   { width: '100%', maxWidth: '360px', background: '#FFFBF0', border: '3px solid #1E1A12', borderRadius: '2px', padding: '2rem', boxShadow: '8px 8px 0 #C8803A', textAlign: 'center' },
  edition:   { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 8px' },
  title:     { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '3.5rem', fontWeight: 900, color: '#1E1A12', letterSpacing: '-0.04em', margin: 0 },
  goldBar:   { height: '4px', background: '#C8803A', borderRadius: '2px', margin: '12px 0', width: '80px' },
  subtitle:  { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 2rem' },
  section:   { marginBottom: '1.5rem' },
  sectionLabel: { display: 'block', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' },
  input:     { width: '100%', fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', background: '#F5EDD6', border: '2px solid #C8A830', borderRadius: '2px', padding: '10px 12px', color: '#1E1A12', outline: 'none', boxSizing: 'border-box' },
  diffGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  diffBtn:   { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'transparent', border: '2px solid #C8A830', borderRadius: '2px', cursor: 'pointer', textAlign: 'left' },
  diffBtnActive: { background: '#1E1A12', borderColor: '#C8A830', boxShadow: '3px 3px 0 #8A6820' },
  diffEmoji: { fontSize: '1.4rem' },
  diffLabel: { fontFamily: "'Playfair Display', serif", fontSize: '0.85rem', fontWeight: 700, color: '#1E1A12' },
  diffDesc:  { fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', color: '#8A7E65', letterSpacing: '0.05em', marginTop: '2px' },
  startBtn:  { width: '100%', fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F5EDD6', background: '#5E6B3A', border: '3px solid #3D4A20', borderRadius: '2px', padding: '14px', cursor: 'pointer', boxShadow: '4px 4px 0 #2A3010', marginTop: '1rem' },
  scores:    { display: 'flex', flexDirection: 'column', gap: '8px', margin: '1rem 0' },
  scoreRow:  { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#EDE0C0', borderRadius: '2px', border: '1px solid #C8A830' },
  scoreName: { fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#1E1A12' },
  scoreVal:  { fontFamily: "'DM Mono', monospace", fontSize: '1rem', fontWeight: 700, color: '#5E6B3A' },
  winnerMsg: { fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: '#5A4A30', margin: '0 0 1rem' },
  errorBox:  { background: '#FFF0EE', border: '1.5px solid #8B2020', borderRadius: '2px', padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8B2020', cursor: 'pointer' },

  // Header
  header:      { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 20px', background: '#1E1A12', borderBottom: '2px solid #C8A830' },
  headerTitle: { fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 900, color: '#C8A830' },
  headerTurn:  { fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#8A7E65', flex: 1 },
  headerTiles: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65' },
  headerDots:  { display: 'flex', gap: '4px', alignItems: 'center' },
  dot:         { width: '5px', height: '5px', borderRadius: '50%', background: '#C8A830', animation: 'dot 1s ease-in-out infinite' },

  // Bannière IA
  aiBanner: {
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '10px 20px', background: '#140F00',
    borderBottom: '2px solid #C8A830',
  },
  aiSpinner: {
    flexShrink: 0, width: '22px', height: '22px',
    border: '2.5px solid rgba(200,168,48,0.2)',
    borderTopColor: '#C8A830', borderRadius: '50%',
    animation: 'spin 0.85s linear infinite',
  },
  aiBannerTitle: { fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '0.88rem', color: '#C8A830' },
  aiBannerSub:   { fontFamily: "'DM Mono', monospace", fontSize: '0.57rem', color: '#8A6820', marginTop: '2px' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(200,168,48,0.1)' },
  progressBar: {
    position: 'absolute', top: 0, bottom: 0, width: '45%',
    background: 'linear-gradient(90deg, transparent, #C8A830, transparent)',
    animation: 'shimmer 1.5s ease-in-out infinite',
  },

  // Jeu
  gamePage: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 52px)', background: '#F5EDD6' },
  layout:   { display: 'flex', gap: '16px', padding: '16px', flex: 1, flexWrap: 'wrap' },
  sidebar:  { display: 'flex', flexDirection: 'column', gap: '12px', width: '220px', flexShrink: 0 },
  center:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 },
  hint:     { background: '#EDE0C0', border: '1.5px solid rgba(200,168,48,0.4)', borderRadius: '2px', padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65', letterSpacing: '0.05em', transition: 'background 0.3s, color 0.3s' },
  hintAI:   { background: '#140F00', borderColor: '#C8A830', color: '#C8A830' },
  actions:  { display: 'flex', flexDirection: 'column', gap: '8px' },
  btn:      { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1E1A12', background: 'transparent', border: '2px solid #1E1A12', borderRadius: '2px', padding: '9px 14px', cursor: 'pointer', boxShadow: '2px 2px 0 #8A7E65' },
  btnPrimary: { background: '#5E6B3A', color: '#F5EDD6', border: '2px solid #3D4A20', boxShadow: '2px 2px 0 #2A3010' },
  swapPanel: { background: '#FFFBF0', border: '2px solid #C8A830', borderRadius: '2px', padding: '14px' },
  swapTitle: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A7E65', margin: '0 0 10px' },
  rackWrap:  { marginTop: '8px' },
  loadingRow:  { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px' },
  spinner:     { width: '22px', height: '22px', border: '2.5px solid #C8A830', borderTopColor: '#1E1A12', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: '#8A7E65' },
};