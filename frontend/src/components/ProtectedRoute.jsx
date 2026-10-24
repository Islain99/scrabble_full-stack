// src/components/ProtectedRoute.jsx
//
// ⚡ Changements :
//   - Nouveau prop `requireCompleteProfile` : si vrai et que user.profile_complete === false,
//     redirige vers #/profile avec un message explicatif dans le state.

import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * Protège une route.
 *
 * Props :
 *   requireCompleteProfile (bool) — exige profile_complete === true.
 *     Si non, redirige vers /profile avec un banner d'avertissement.
 */
export default function ProtectedRoute({ children, requireCompleteProfile = false }) {
  const { isAuthenticated, loading, user } = useAuth();
  const { t } = useLanguage();

  // Où rediriger, s'il le faut. La navigation se fait dans un effet :
  // modifier window.location pendant le rendu est un effet de bord.
  let redirectTo = null;
  if (!loading) {
    if (!isAuthenticated) redirectTo = '#/login';
    else if (requireCompleteProfile && user && !user.profile_complete) redirectTo = '#/profile';
  }
  useEffect(() => {
    if (redirectTo) window.location.hash = redirectTo;
  }, [redirectTo]);

  // Spinner pendant le chargement Firebase
  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={styles.label}>{t('common_loading')}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Non connecté → login ; profil incomplet et requis → profil
  if (redirectTo) return null;

  return children;
}

const styles = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F5EDD6',
    gap: '16px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #C8A830',
    borderTopColor: '#1E1A12',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    color: '#8A7E65',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    margin: 0,
  },
};
