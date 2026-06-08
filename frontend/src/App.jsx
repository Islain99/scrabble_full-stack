// src/App.jsx
// Rôle unique : providers + routing hash-based.
// Toute la logique de jeu est dans src/hooks/useGameLogic.js
// Tout le rendu du jeu est dans src/pages/GamePage.jsx

import React, { useState, useEffect } from 'react';
import { AuthProvider }     from './context/AuthContext';
import { ThemeProvider }    from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { LanguageProvider } from './context/LanguageContext';

import Navbar         from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import GamePage       from './pages/GamePage';
import ProfilePage    from './pages/ProfilePage';
import SettingsPage   from './pages/SettingsPage';
import LoginPage      from './pages/LoginPage';
import RegisterPage   from './pages/RegisterPage';
import LeaderboardPage from './pages/LeaderboardPage';

import './index.css';
import { TutorialProvider } from './context/TutorialContext';

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

function Router() {
  const hash = useHashRoute();

  const renderPage = () => {
    if (hash === '#/login')       return <LoginPage />;
    if (hash === '#/register')    return <RegisterPage />;
    if (hash === '#/settings')    return <SettingsPage />;
    if (hash === '#/leaderboard') return <LeaderboardPage />;

    return (
      <ProtectedRoute>
        {hash === '#/profile' ? <ProfilePage /> : <GamePage />}
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

// ── Racine ────────────────────────────────────────────────────────

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <TutorialProvider>
          <SettingsProvider>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </SettingsProvider>
        </TutorialProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}