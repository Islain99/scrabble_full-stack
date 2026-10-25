// src/App.jsx
// Rôle unique : providers + routing hash-based.
// Toute la logique de jeu est dans src/hooks/useGameLogic.js
// Tout le rendu du jeu est dans src/pages/GamePage.jsx

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider }     from './context/AuthContext';
import { ThemeProvider }    from './context/ThemeContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';

import Navbar         from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

// La page de jeu est l'accueil : chargée tout de suite.
import GamePage       from './pages/GamePage';

// Les autres pages sont téléchargées seulement quand on les ouvre.
// Le multijoueur emporte la base temps réel Firebase, le profil Firebase
// Storage : ni l'un ni l'autre ne pèse plus sur le premier chargement.
const ProfilePage     = lazy(() => import('./pages/ProfilePage'));
const SettingsPage    = lazy(() => import('./pages/SettingsPage'));
const LoginPage       = lazy(() => import('./pages/LoginPage'));
const RegisterPage    = lazy(() => import('./pages/RegisterPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const MultiplayerPage = lazy(() => import('./pages/MultiplayerPage'));

import './index.css';
import './styles/mobile.css';
import './styles/desktop.css';
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

// Affiché le temps de télécharger une page (souvent imperceptible)
function PageLoader() {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      style={{
        minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Libre Baskerville', Georgia, serif", fontStyle: 'italic',
        color: 'var(--text-muted)',
      }}
    >
      {t('common_loading')}
    </div>
  );
}

function Router() {
  const hash = useHashRoute();
  // Paramètres après « ? » ignorés pour le choix de la page (ex. #/multiplayer?code=ABC234)
  const route = hash.split('?')[0];

  const renderPage = () => {
    if (route === '#/login')       return <LoginPage />;
    if (route === '#/register')    return <RegisterPage />;
    if (route === '#/settings')    return <SettingsPage />;
    if (route === '#/leaderboard') return <LeaderboardPage />;
    if (route === '#/multiplayer') return (
      <ProtectedRoute>
        <MultiplayerPage />
      </ProtectedRoute>
    );

    return (
      <ProtectedRoute>
        {route === '#/profile' ? <ProfilePage /> : <GamePage />}
      </ProtectedRoute>
    );
  };

  return (
    <div>
      <Navbar />
      <Suspense fallback={<PageLoader />}>
        {renderPage()}
      </Suspense>
    </div>
  );
}

function AppWithTutorial({ children }) {
  const { settings } = useSettings();
  return (
    <TutorialProvider settings={settings}>
      {children}
    </TutorialProvider>
  );
}

// ── Racine ────────────────────────────────────────────────────────

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <AppWithTutorial>
              <Router />
            </AppWithTutorial>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}