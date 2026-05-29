// src/App.jsx — Routing hash-based + AuthProvider + sauvegarde auto des parties
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { saveGame } from './api/authService';import './index.css';
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
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

function Router() {
  const hash = useHashRoute();

  const renderPage = () => {
    // Pages publiques — accessibles sans compte
    if (hash === '#/login')    return <LoginPage />;
    if (hash === '#/register') return <RegisterPage />;

    // Tout le reste nécessite une authentification
    return (
      <ProtectedRoute>
        {hash === '#/leaderboard' ? <LeaderboardPage /> :
         hash === '#/profile'     ? <ProfilePage />     :
         <GameApp />}
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
  const { user, token, isAuthenticated, getFreshToken } = useAuth();

  const [gameState, setGameState]           = useState(null);
  const [gameId, setGameId]                 = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(0);
  const [wordPlacements, setWordPlacements] = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]   = useState(null);
  const [gameSaved, setGameSaved]           = useState(false);

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
      try {
        const updated = await gameService.aiPlayTurn(gameId);
        setGameState(updated);
      } catch (e) {
        console.error('Erreur IA:', e?.response?.data?.detail);
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
    const won = gameState.winner_name === humanPlayer.name;

    const doSave = async () => {
      try {
        // Rafraîchir le token avant l'appel (évite les erreurs 401)
        const freshToken = await getFreshToken();
        if (!freshToken) return;

        await saveGame(freshToken, {
          game_id:          gameId,
          user_score:       humanPlayer.score,
          ai_name:          aiPlayer.name,
          ai_score:         aiPlayer.score,
          ai_difficulty:    'medium',
          won,
          duration_seconds: duration,
          turns_count:      gameState.passes_count,
        });
        setGameSaved(true);
      } catch (err) {
        // 409 = partie déjà enregistrée (doublon) → on l'ignore
        if (err?.response?.status === 409) {
          setGameSaved(true);
          return;
        }
        console.warn('Sauvegarde partie échouée:', err?.response?.data?.detail || err.message);
      }
    };

    doSave();
  }, [gameState?.status, gameState?.winner_name, isAuthenticated, gameSaved]);

  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id
    : 0;

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
      const initialGame = await gameService.startGame([playerName, 'HAL 9000 (IA)']);
      setGameState(initialGame);
      setGameId(initialGame.game_id);
      setCurrentPlayerId(initialGame.players[0].id);
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
      setGameStartTime(Date.now());
      setGameSaved(false);
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

  const toggleTileForSwap = (letter) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  };

  // ── Abandon ──────────────────────────────────────────────────
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  const handleAbandonConfirm = async () => {
    setShowAbandonModal(false);

    const humanPlayer = gameState.players.find(p => !p.is_ai);

    try {
      // 1. Informer le backend — marque FINISHED, libère la mémoire serveur
      const finalState = await gameService.abandonGame(gameId, humanPlayer?.id ?? 0);

      // 2. Mettre à jour l'UI — le useEffect de sauvegarde auto se déclenche
      //    automatiquement quand il détecte status === 'FINISHED'
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
      setGameSaved(false); // garantit que la sauvegarde auto se lance
      setGameState(finalState); // déclenche le useEffect

    } catch (err) {
      console.warn('Abandon backend error:', err?.response?.data?.detail || err.message);
      // Backend indisponible — reset local
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
  const rackTilesForDisplay = currentRack.filter(tile => !tilesInUse.includes(tile));

  // ── Start Screen ─────────────────────────────────────────────
  if (!gameState || gameState.status === 'SETUP') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem', maxWidth: '480px' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.3em', color: '#8A7E65', textTransform: 'uppercase', marginBottom: '12px' }}>
            Édition de Luxe — 1972
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(3.5rem, 10vw, 6rem)', fontWeight: 900, color: '#1E1A12', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            SCRABBLE
          </h1>
          <div style={{ height: '4px', background: 'linear-gradient(90deg, transparent, #C8803A, #C8A830, #C8803A, transparent)', margin: '16px auto', maxWidth: '300px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: '#5E6B3A', fontSize: '1rem', margin: 0 }}>
            Le jeu classique des mots croisés
          </p>
          {isAuthenticated && user && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#C8803A', letterSpacing: '0.1em', marginTop: '12px' }}>
              Bienvenue, {user.display_name} · {user.games_played} partie{user.games_played !== 1 ? 's' : ''} jouée{user.games_played !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div style={{ border: '3px solid #1E1A12', padding: '2rem 3rem', textAlign: 'center', boxShadow: '6px 6px 0 #C8803A', background: '#F5EDD6', maxWidth: '360px', width: '100%' }}>
          <RetroButton onClick={handleStartGame} variant="primary" fullWidth>
            Démarrer la partie
          </RetroButton>
        </div>
      </div>
    );
  }

  // ── Finished Screen ──────────────────────────────────────────
  if (gameState.status === 'FINISHED') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ border: '3px solid #1E1A12', padding: '2.5rem', background: '#F5EDD6', boxShadow: '8px 8px 0 #C8803A', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Partie Terminée</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.5rem', fontWeight: 900, color: '#1E1A12', margin: '0 0 4px' }}>
            {gameState.winner_name}
          </h1>
          <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: '#5E6B3A', margin: '0 0 24px' }}>remporte la victoire</p>
          {gameSaved && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: '#5E6B3A', letterSpacing: '0.08em', marginBottom: '16px' }}>
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
    <div style={{ minHeight: '100vh', padding: '1.5rem 2rem', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '3px solid #1E1A12', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, color: '#1E1A12', letterSpacing: '-0.04em', margin: 0 }}>
            SCRABBLE
          </h1>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: '#8A7E65', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Édition 1972</span>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.82rem', color: '#8A7E65', letterSpacing: '0.08em' }}>
          Tour de → <span style={{ color: '#C8803A', fontWeight: 600 }}>{gameState.players[gameState.current_player_index]?.name}</span>
        </div>
      </header>

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
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: '#8A7E65', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>
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

          <ScorePreview score={previewScore} count={wordPlacements.length} />

          {/* Boutons d'action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <RetroButton
              onClick={handleValidateWord}
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
          <div style={{ borderTop: '1px solid rgba(200,168,48,0.3)', paddingTop: '14px' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', color: '#8A7E65', letterSpacing: '0.06em', lineHeight: 1.6, margin: '0 0 10px' }}>
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
              background: '#F5EDD6',
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
              color: '#8B2020', margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>
              Abandonner ?
            </h2>

            <p style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '0.95rem', color: '#5E4A3A',
              fontStyle: 'italic', margin: '0 0 6px',
            }}>
              La partie sera comptée comme une défaite.
            </p>

            {/* Scores actuels */}
            <div style={{
              background: '#EDE0C0',
              border: '1.5px solid rgba(139,32,32,0.2)',
              borderRadius: '2px',
              padding: '10px 14px',
              margin: '16px 0',
              display: 'flex',
              justifyContent: 'space-around',
            }}>
              {gameState.players.map(p => (
                <div key={p.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700, color: '#1E1A12' }}>
                    {p.score}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: '#8A7E65' }}>pts</div>
                </div>
              ))}
            </div>

            {isAuthenticated && (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', letterSpacing: '0.05em', margin: '0 0 20px' }}>
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
    default: { bg: 'transparent', color: '#1E1A12', border: '#1E1A12', hover: '#1E1A12', hoverText: '#F5EDD6' },
    primary: { bg: '#5E6B3A', color: '#F5EDD6', border: '#3D4A20', hover: '#4A5528', hoverText: '#F5EDD6' },
    danger:  { bg: 'transparent', color: '#8B2020', border: '#8B2020', hover: '#8B2020', hoverText: '#F5EDD6' },
    tobacco: { bg: 'transparent', color: '#8A5010', border: '#C8803A', hover: '#C8803A', hoverText: '#F5EDD6' },
  };
  const v = variants[variant] || variants.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: fullWidth ? '100%' : 'auto',
      background: v.bg,
      color: disabled ? '#B0A080' : v.color,
      border: `2px solid ${disabled ? '#C8C0A8' : v.border}`,
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
    <div style={{ flex: 1, height: '1px', background: '#C8A830', opacity: 0.4 }} />
    {label && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: '#8A7E65', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    <div style={{ flex: 1, height: '1px', background: '#C8A830', opacity: 0.4 }} />
  </div>
);

const ScorePreview = ({ score, count }) => (
  <div style={{ background: '#1E1A12', border: '2px solid #C8A830', borderRadius: '2px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '3px 3px 0 #8A6820' }}>
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', color: '#8A7E65', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Score provisoire</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: '#6B5E45' }}>{count} tuile{count !== 1 ? 's' : ''} posée{count !== 1 ? 's' : ''}</div>
    </div>
    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.6rem', fontWeight: 700, color: '#C8A830', lineHeight: 1 }}>{score}</div>
  </div>
);

const Legend = () => {
  const items = [{ color: '#8B2020', label: 'Mot ×3' }, { color: '#C8803A', label: 'Mot ×2' }, { color: '#1A4A8A', label: 'Lettre ×3' }, { color: '#3A7EB8', label: 'Lettre ×2' }];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '14px', height: '14px', background: item.color, borderRadius: '2px', flexShrink: 0 }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: '#8A7E65', letterSpacing: '0.05em' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};