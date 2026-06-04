// src/App.jsx — Routing hash-based + AuthProvider + sauvegarde auto des parties
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import TurnTimer from './components/TurnTimer';
import GameHeader from './components/GameHeader';
import SettingsPage from './pages/SettingsPage';
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
import { saveGame, getHistory } from './api/authService';
import './index.css';
import { POINTS_LETTRES } from './data/constants';

const CLIENT_POINTS = POINTS_LETTRES;

// ── Router hash-based simple ──────────────────────────────────────

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

// ── Root router ───────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

function Router() {
  const hash = useHashRoute();

  const renderPage = () => {
    // Pages publiques — accessibles sans compte
    if (hash === '#/login')    return <LoginPage />;
    if (hash === '#/register') return <RegisterPage />;
    if (hash === '#/settings') return <SettingsPage />;
    if (hash === '#/leaderboard') return <LeaderboardPage />;

    // Jeu + profil nécessitent une authentification
    return (
      <ProtectedRoute>
        {hash === '#/profile' ? <ProfilePage /> : <GameApp />}
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

// ── Game App ──────────────────────────────────────────────────────

function GameApp() {
  const { user, isAuthenticated } = useAuth();
  const { settings, DIFFICULTY_META } = useSettings();

  const [gameState, setGameState]           = useState(null);
  const [gameId, setGameId]                 = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(0);
  const [wordPlacements, setWordPlacements] = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]   = useState(null);
  const [gameSaved, setGameSaved]           = useState(false);
  const [aiMessage, setAiMessage] = useState(null);
  const [timerActive, setTimerActive]       = useState(false);
  const timerResetRef = useRef(null);
  

  const calculatePreviewScore = (placements) => {
    if (placements.length === 0) return 0;
    let score = 0, wordMultiplier = 1;
    placements.forEach(p => {
      let ls = CLIENT_POINTS[p.letter] || 0;
      const bonus = (p.r === 7 && p.c === 7) ? 'DM' : null;
      if (bonus === 'DL') ls *= 2;
      if (bonus === 'TL') ls *= 3;
      if (bonus === 'DM') wordMultiplier *= 2;
      if (bonus === 'TM') wordMultiplier *= 3;
      score += ls;
    });
    return score * wordMultiplier;
  };

  const previewScore = useMemo(() => calculatePreviewScore(wordPlacements), [wordPlacements]);

  // ── IA auto-play ─────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId) return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer?.is_ai) return;
    const delay = setTimeout(async () => {
      const { gameState: updated, message } = await gameService.aiPlayTurn(gameId);
      setGameState(updated);
      if (message) {
        setAiMessage(message);
        setTimeout(() => setAiMessage(null), 4000);
      }
    }, 1500);
    return () => clearTimeout(delay);
  }, [gameState, gameId]);

  // ── Sauvegarde auto quand la partie se termine ────────────────
  useEffect(() => {
    if (!gameState || gameState.status !== 'FINISHED' || !isAuthenticated || gameSaved) return;

    const humanPlayer = gameState.players.find(p => !p.is_ai);
    const aiPlayer    = gameState.players.find(p => p.is_ai);
    if (!humanPlayer || !aiPlayer) return;

    const duration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null;

    // Construire le payload avec des types explicites pour éviter les 422
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
        // axiosInstance injecte le token automatiquement
        console.log('Sauvegarde payload:', JSON.stringify(payload));
        await saveGame(payload);
        setGameSaved(true);
        console.log('Partie sauvegardee OK');
      } catch (err) {
        if (err?.response?.status === 409) { setGameSaved(true); return; }
        console.error('Sauvegarde echouee', {
          status:  err?.response?.status,
          detail:  JSON.stringify(err?.response?.data),
          payload: JSON.stringify(payload),
        });
      }
    };

    doSave();
  }, [gameState?.status, gameState?.winner_name, isAuthenticated, gameSaved]);

  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id
    : 0;

  const isAITurn = gameState
    ? gameState.players[gameState.current_player_index]?.is_ai ?? false
    : false;

  // ── Handlers DnD ─────────────────────────────────────────────
  const handleDropTile = (rackIndex, r, c) => {
    const fullRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
    const placedOriginals = wordPlacements.map(pl => pl.originalTile);
    const availableTiles = fullRack.filter(tile => !placedOriginals.includes(tile));
    const tileToPlace = availableTiles[rackIndex];
    if (!tileToPlace) return;
    if (wordPlacements.some(pl => pl.r === r && pl.c === c)) return;
    setWordPlacements(prev => [...prev, { letter: tileToPlace.letter, r, c, originalTile: tileToPlace, rackIndex }]);
  };

  const handleMoveTile = (fromR, fromC, toR, toC) => {
    if (wordPlacements.some(pl => pl.r === toR && pl.c === toC)) return;
    setWordPlacements(prev => prev.map(pl => pl.r === fromR && pl.c === fromC ? { ...pl, r: toR, c: toC } : pl));
  };

  const handleReturnTile = (r, c) => {
    setWordPlacements(prev => prev.filter(pl => !(pl.r === r && pl.c === c)));
  };

  // ── Actions de jeu ───────────────────────────────────────────
  const handleStartGame = async () => {
    try {
      // Utilise le vrai nom de l'utilisateur si connecté
      const playerName = isAuthenticated && user?.display_name ? user.display_name : 'Joueur';
      const initialGame = await gameService.startGame([playerName, 'HAL 9000 (IA)'], settings.difficulty);
      setGameState(initialGame);
      setGameId(initialGame.game_id);
      setCurrentPlayerId(initialGame.players[0].id);
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(Date.now());
      setGameSaved(false);
      setTimerActive(true);
    } catch (e) {
      console.error('Erreur démarrage:', e);
      alert('Erreur lors du démarrage. Vérifiez votre connexion au backend.');
    }
  };

  const handleValidateWord = async () => {
    if (!gameId || wordPlacements.length === 0) { alert('Veuillez placer un mot sur le plateau.'); return; }
    setSelectedTilesToSwap([]);
    const placementsAPI = wordPlacements.map(p => [p.r, p.c, p.letter]);
    try {
      const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
      setGameState(result);
      setWordPlacements([]);
      if (result.status !== 'FINISHED') {
        setCurrentPlayerId(result.players[result.current_player_index].id);
        timerResetRef.current?.(); // reset timer pour le prochain tour
      }
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Mot invalide ou placement illégal.'}`);
      setWordPlacements([]);
    }
  };

  const handlePassTurn = async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  const handleShuffleRack = async () => {
    if (!gameId) return;
    try {
      const updated = await gameService.shuffleRack(gameId, currentPlayerId);
      setGameState(updated);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  const handleSwapTiles = async () => {
    if (!gameId || selectedTilesToSwap.length === 0) { alert('Sélectionnez les lettres à échanger.'); return; }
    setWordPlacements([]);
    try {
      const updated = await gameService.swapTiles(gameId, activePlayerId, selectedTilesToSwap);
      setGameState(updated);
      setSelectedTilesToSwap([]);
    } catch (error) {
      alert(`Échec de l'échange : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  // ── Expiration du timer → passer le tour automatiquement ────────
  const handleTimerExpire = useCallback(async () => {
    if (!gameId || isAITurn) return;
    setWordPlacements([]);
    setSelectedTilesToSwap([]);
    try {
      const updated = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updated);
      timerResetRef.current?.();
    } catch (e) {
      console.error('Auto-pass échoué:', e);
    }
  }, [gameId, activePlayerId, isAITurn]);

  const toggleTileForSwap = (letter) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  };

  // ── Abandon ──────────────────────────────────────────────────
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  const handleAbandonConfirm = async () => {
    setShowAbandonModal(false);

    // Capturer toutes les valeurs AVANT tout setState
    const humanPlayer  = gameState.players.find(p => !p.is_ai);
    const aiPlayer     = gameState.players.find(p => p.is_ai);
    const capturedId   = gameId;
    const duration     = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null;
    const turnsCount   = gameState.passes_count;

    try {
      // 1. Informer le backend
      const finalState = await gameService.abandonGame(capturedId, humanPlayer?.id ?? 0);

      // 2. Sauvegarder dans l'historique — directement ici, token forcé frais
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

      // 3. Mettre à jour l'UI — setGameSaved(true) empêche le useEffect de re-sauvegarder
      setGameSaved(true);
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
      setGameState(finalState);

    } catch (err) {
      console.warn('Abandon backend error:', err?.response?.data?.detail || err.message);
      setGameState(null);
      setGameId(null);
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
      setCurrentPlayerId(0);
      setGameStartTime(null);
      setGameSaved(false);
    }
  };

  const isSwapMode = selectedTilesToSwap.length > 0;
  const currentRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
  const tilesInUse = wordPlacements.map(p => p.originalTile);
  const rackTilesRaw = currentRack.filter(tile => !tilesInUse.includes(tile));
  const rackTilesForDisplay = settings.autoSortRack
    ? [...rackTilesRaw].sort((a, b) => a.letter.localeCompare(b.letter))
    : rackTilesRaw;

  // ── Start Screen ─────────────────────────────────────────────
  const currentDiffMeta = DIFFICULTY_META[settings.difficulty] || DIFFICULTY_META.medium;
  const turnLabel = settings.turnDuration === 0
    ? 'Illimité'
    : `${Math.floor(settings.turnDuration / 60)}:${String(settings.turnDuration % 60).padStart(2,'0')} min`;

  if (!gameState || gameState.status === 'SETUP') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--bg-page)' }}>

        <div style={{ textAlign: 'center', marginBottom: '2.5rem', maxWidth: '480px' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
            Édition de Luxe — 1972
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(3.5rem, 10vw, 6rem)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            SCRABBLE
          </h1>
          <div style={{ height: '4px', background: 'linear-gradient(90deg, transparent, var(--tobacco), var(--gold), var(--tobacco), transparent)', margin: '16px auto', maxWidth: '300px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: 'var(--olive)', fontSize: '1rem', margin: 0 }}>
            Le jeu classique des mots croisés
          </p>
          {isAuthenticated && user && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--tobacco)', letterSpacing: '0.1em', marginTop: '12px' }}>
              Bienvenue, {user.display_name} · {user.games_played} partie{user.games_played !== 1 ? 's' : ''} jouée{user.games_played !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div style={{ border: '3px solid var(--border-primary)', boxShadow: '6px 6px 0 var(--shadow-card)', background: 'var(--bg-card)', maxWidth: '440px', width: '100%', overflow: 'hidden', borderRadius: '2px' }}>
          {/* Récap des paramètres actifs */}
          <div style={{ background: 'var(--bg-invert)', padding: '12px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>{currentDiffMeta.emoji}</span>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: 'var(--text-invert-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Difficulté</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-invert)' }}>{currentDiffMeta.label}</div>
              </div>
            </div>
            <div style={{ width: '1px', height: '32px', background: 'rgba(200,168,48,0.2)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: 'var(--text-invert-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Durée de tour</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-invert)' }}>{turnLabel}</div>
            </div>
            <a href="#/settings" style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: 'var(--gold)', textDecoration: 'none', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--gold)' }}>
              Modifier →
            </a>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!isAuthenticated && (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em', lineHeight: 1.6, margin: 0 }}>
                <a href="#/login" style={{ color: 'var(--tobacco)', textDecoration: 'underline' }}>Connectez-vous</a> pour sauvegarder vos parties et apparaître au classement.
              </p>
            )}
            <RetroButton onClick={handleStartGame} variant="primary" fullWidth>
              ▶ Démarrer la partie
            </RetroButton>
          </div>
        </div>
      </div>
    );
  }

  // ── Finished Screen ──────────────────────────────────────────
  if (gameState.status === 'FINISHED') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ border: '3px solid var(--border-primary)', padding: '2.5rem', background: 'var(--bg-page)', boxShadow: '8px 8px 0 var(--shadow-card)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Partie Terminée</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {gameState.winner_name}
          </h1>
          <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: 'var(--olive)', margin: '0 0 24px' }}>remporte la victoire</p>
          {gameSaved && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--olive)', letterSpacing: '0.08em', marginBottom: '16px' }}>
              ✓ Partie enregistrée dans votre profil
            </p>
          )}
          <div style={{ marginBottom: '24px' }}>
            <ScorePanel players={gameState.players} currentPlayerId={-1} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <RetroButton onClick={handleStartGame} variant="primary">Rejouer</RetroButton>
            {isAuthenticated && (
              <RetroButton onClick={() => { window.location.hash = '#/profile'; }} variant="default">Mon profil</RetroButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Game Screen ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>

      {/* GameHeader sticky */}
      <GameHeader
        gameState={gameState}
        timerActive={timerActive && !isAITurn}
        timerResetRef={timerResetRef}
        onTimerExpire={handleTimerExpire}
      />

      {aiMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position:  'fixed',
            bottom:    '24px',
            left:      '50%',
            transform: 'translateX(-50%)',
            zIndex:    200,
            background: 'var(--bg-card)',
            border:    '2px solid var(--gold)',
            borderRadius: '8px',
            padding:   '10px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            fontFamily: "'DM Mono', monospace",
            fontSize:  '0.9rem',
            color:     'var(--text-primary)',
            display:   'flex',
            alignItems: 'center',
            gap:       '10px',
            maxWidth:  '90vw',
            animation: 'fadeInUp 0.25s ease',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🤖</span>
          <span>{aiMessage}</span>
          <button
            onClick={() => setAiMessage(null)}
            aria-label="Fermer"
            style={{
              marginLeft: '8px',
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      'var(--text-muted)',
              fontSize:   '1rem',
              lineHeight: 1,
              padding:    '0 2px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ padding: '1.5rem 2rem', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* Layout principal : plateau + sidebar côte à côte */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: '2rem',
        alignItems: 'start',
      }}>

        {/* Colonne gauche : plateau + rack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Board
            gameState={gameState} placements={wordPlacements}
            onDropTile={handleDropTile} onMoveTile={handleMoveTile} onReturnTile={handleReturnTile}
          />
          <Legend />
          <div style={{ marginTop: '4px' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>
              {isSwapMode
                ? `${selectedTilesToSwap.length} tuile(s) sélectionnée(s) pour l'échange`
                : 'Glissez vos lettres sur le plateau'}
            </div>
            <TileRack
              tiles={rackTilesForDisplay} playerId={currentPlayerId}
              onTileClick={isSwapMode ? toggleTileForSwap : undefined}
              selectedTiles={selectedTilesToSwap}
            />
          </div>
        </div>

        {/* Sidebar droite : scores + actions */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px' }}>

          <ScorePanel players={gameState.players} currentPlayerId={currentPlayerId} />

          {settings.showScorePreview && (
            <ScorePreview score={previewScore} count={wordPlacements.length} />
          )}

          {/* Boutons d'action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <RetroButton
              onClick={async () => {
                if (settings.confirmValidation && wordPlacements.length > 0) {
                  if (!window.confirm(`Valider ce mot (${wordPlacements.length} tuile${wordPlacements.length > 1 ? 's' : ''}) ?`)) return;
                }
                await handleValidateWord();
              }}
              disabled={wordPlacements.length === 0 || isSwapMode}
              variant="primary" fullWidth
            >
              ✓ Valider le mot ({wordPlacements.length} tuile{wordPlacements.length !== 1 ? 's' : ''})
            </RetroButton>
            <RetroButton
              onClick={handlePassTurn}
              disabled={isSwapMode || wordPlacements.length > 0}
              variant="default" fullWidth
            >
              Passer le tour
            </RetroButton>
            <RetroButton
              onClick={handleShuffleRack}
              disabled={isSwapMode || wordPlacements.length > 0}
              variant="tobacco" fullWidth
            >
              ⇄ Mélanger le rack
            </RetroButton>
          </div>

          {/* Échange */}
          <div style={{ borderTop: '1px solid var(--border-gold)', paddingTop: '14px' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: 1.6, margin: '0 0 10px' }}>
              Pour échanger : sélectionnez les tuiles dans le rack, puis cliquez ci-dessous.
            </p>
            <RetroButton
              onClick={handleSwapTiles}
              disabled={selectedTilesToSwap.length === 0 || wordPlacements.length > 0}
              variant="danger" fullWidth
            >
              Échanger {selectedTilesToSwap.length > 0 ? `(${selectedTilesToSwap.length})` : ''}
            </RetroButton>
          </div>

          {/* Abandonner */}
          <div style={{ borderTop: '1px solid rgba(139,32,32,0.2)', paddingTop: '14px', marginTop: '4px' }}>
            <RetroButton
              onClick={() => setShowAbandonModal(true)}
              variant="danger" fullWidth
            >
              ✕ Abandonner la partie
            </RetroButton>
          </div>

        </aside>
      </div>

      </div>{/* /container */}

      {/* ── Modal confirmation abandon ─────────────────────── */}
      {showAbandonModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,18,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}
          onClick={() => setShowAbandonModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-page)',
              border: '3px solid #8B2020',
              borderRadius: '3px',
              padding: '2rem 2.4rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '8px 8px 0 #8B2020',
              textAlign: 'center',
            }}
          >
            {/* Icône */}
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏳️</div>

            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.6rem', fontWeight: 900,
              color: 'var(--brick)', margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>
              Abandonner ?
            </h2>

            <p style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '0.95rem', color: 'var(--text-secondary)',
              fontStyle: 'italic', margin: '0 0 6px',
            }}>
              La partie sera comptée comme une défaite.
            </p>

            {/* Scores actuels */}
            <div style={{
              background: 'var(--bg-card-alt)',
              border: '1.5px solid rgba(139,32,32,0.2)',
              borderRadius: '2px',
              padding: '10px 14px',
              margin: '16px 0',
              display: 'flex',
              justifyContent: 'space-around',
            }}>
              {gameState.players.map(p => (
                <div key={p.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {p.score}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)' }}>pts</div>
                </div>
              ))}
            </div>

            {isAuthenticated && (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 20px' }}>
                La partie sera enregistrée dans votre historique.
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <RetroButton
                onClick={() => setShowAbandonModal(false)}
                variant="default"
              >
                Continuer à jouer
              </RetroButton>
              <RetroButton
                onClick={handleAbandonConfirm}
                variant="danger"
              >
                Confirmer l'abandon
              </RetroButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composants UI réutilisables ───────────────────────────────────

const RetroButton = ({ onClick, disabled, children, variant = 'default', fullWidth = false }) => {
  const variants = {
    default: { bg: 'transparent',       color: 'var(--text-primary)', border: 'var(--border-primary)', hover: 'var(--text-primary)',  hoverText: 'var(--bg-page)' },
    primary: { bg: 'var(--olive)',       color: 'var(--text-invert)',  border: 'var(--olive-dk)',        hover: 'var(--olive-dk)',      hoverText: 'var(--text-invert)' },
    danger:  { bg: 'transparent',       color: 'var(--brick)',        border: 'var(--brick)',           hover: 'var(--brick)',         hoverText: 'var(--bg-page)' },
    tobacco: { bg: 'transparent',       color: 'var(--tobacco-dk)',   border: 'var(--tobacco)',         hover: 'var(--tobacco)',       hoverText: 'var(--text-invert)' },
  };
  const v = variants[variant] || variants.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: fullWidth ? '100%' : 'auto',
      background: v.bg,
      color: disabled ? 'var(--text-muted)' : v.color,
      border: `2px solid ${disabled ? 'var(--border-muted)' : v.border}`,
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.82rem',
      fontWeight: 500,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '11px 18px',
      borderRadius: '2px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.12s, color 0.12s',
      boxShadow: disabled ? 'none' : `3px 3px 0 ${v.border}`,
    }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = v.hover; e.currentTarget.style.color = v.hoverText; } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = v.bg; e.currentTarget.style.color = v.color; } }}>
      {children}
    </button>
  );
};

const Divider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0 10px' }}>
    <div style={{ flex: 1, height: '1px', background: 'var(--gold)', opacity: 0.4 }} />
    {label && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    <div style={{ flex: 1, height: '1px', background: 'var(--gold)', opacity: 0.4 }} />
  </div>
);

const ScorePreview = ({ score, count }) => (
  <div style={{ background: 'var(--bg-invert)', border: '2px solid var(--gold)', borderRadius: '2px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '3px 3px 0 var(--border-gold-dk)', transition: 'background 0.25s' }}>
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Score provisoire</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: 'var(--text-invert-muted)' }}>{count} tuile{count !== 1 ? 's' : ''} posée{count !== 1 ? 's' : ''}</div>
    </div>
    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.6rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>{score}</div>
  </div>
);

const Legend = () => {
  const items = [
    { bg: 'var(--bonus-tm)', label: 'Mot ×3' },
    { bg: 'var(--bonus-dm)', label: 'Mot ×2' },
    { bg: 'var(--bonus-tl)', label: 'Lettre ×3' },
    { bg: 'var(--bonus-dl)', label: 'Lettre ×2' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '14px', height: '14px', background: item.bg, borderRadius: '2px', flexShrink: 0 }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};