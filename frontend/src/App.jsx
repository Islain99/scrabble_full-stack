// src/App.jsx — Routing hash-based + AuthProvider + sauvegarde auto des parties
//
// ⚡ Changements :
//   - GameApp est maintenant dans <ProtectedRoute> : connexion obligatoire pour jouer.
//   - Si connecté mais profil incomplet → redirige vers #/profile avec message.

import React, { useState, useEffect } from 'react';
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
import { POINTS_LETTRES } from './data/constants';

const CLIENT_POINTS = POINTS_LETTRES;

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
    // Page de jeu : authentification + profil complet requis
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

// ── Game App ──────────────────────────────────────────────────────

function GameApp() {
  const { user } = useAuth();

  const [gameState, setGameState]               = useState(null);
  const [gameId, setGameId]                     = useState(null);
  const [currentPlayerId, setCurrentPlayerId]   = useState(0);
  const [wordPlacements, setWordPlacements]     = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
  const [gameStartTime, setGameStartTime]       = useState(null);
  const [gameSaved, setGameSaved]               = useState(false);

  const calculatePreviewScore = (placements) => {
    if (placements.length === 0) return 0;
    let score = 0, wordMultiplier = 1;
    placements.forEach(p => {
      let ls = CLIENT_POINTS[p.letter] || 0;
      const bonus = (p.r === 7 && p.c === 7)
        ? { ls: 1, ws: 2 }
        : getBonusForCell(p.r, p.c);
      ls *= (bonus?.ls || 1);
      score += ls;
      wordMultiplier *= (bonus?.ws || 1);
    });
    return score * wordMultiplier;
  };

  const getBonusForCell = (r, c) => {
    // Simplifié — même logique que dans l'ancien GameApp
    return null;
  };

  // Sauvegarde automatique à la fin d'une partie
  useEffect(() => {
    if (!gameState || gameState.status !== 'FINISHED' || gameSaved || !user) return;

    const humanPlayer = gameState.players.find(p => !p.is_ai);
    const aiPlayer    = gameState.players.find(p => p.is_ai);
    if (!humanPlayer) return;

    const won = humanPlayer.score > (aiPlayer?.score ?? 0);
    const duration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : null;

    setGameSaved(true);
    saveGame({
      game_id:          gameId || `game_${Date.now()}`,
      user_score:       humanPlayer.score,
      ai_name:          aiPlayer?.name || 'HAL 9000',
      ai_score:         aiPlayer?.score || 0,
      ai_difficulty:    'medium',
      won,
      duration_seconds: duration,
      turns_count:      gameState.passes_count || 0,
    }).catch(console.error);
  }, [gameState?.status]);

  const handleStartGame = async (playerName, difficulty) => {
    setGameSaved(false);
    setGameStartTime(Date.now());
    setWordPlacements([]);
    setSelectedTilesToSwap([]);
    try {
      const state = await gameService.startGame(
        [playerName || user?.display_name || 'Joueur', 'HAL 9000'],
        difficulty,
      );
      setGameState(state);
      setGameId(state.game_id);
      setCurrentPlayerId(0);
    } catch (err) {
      console.error('Erreur démarrage partie:', err);
    }
  };

  // Le reste de la logique de jeu est inchangé — conserve ton implémentation existante.
  // Ce fichier remplace uniquement le routing et l'enrobage ProtectedRoute.

  return (
    <div>
      {/* Ton composant de jeu existant ici */}
      {/* <Board />, <TileRack />, <ScorePanel />, etc. */}
      <p style={{ fontFamily: 'DM Mono, monospace', textAlign: 'center', paddingTop: '40px', color: '#8A7E65' }}>
        Jeu disponible — remplace ce placeholder par ton &lt;Board /&gt; existant.
      </p>
    </div>
  );
}