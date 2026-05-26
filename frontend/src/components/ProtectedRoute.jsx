// src/components/ProtectedRoute.jsx
//
// ⚡ Changements :
//   - Nouveau prop `requireCompleteProfile` : si vrai et que user.profile_complete === false,
//     redirige vers #/profile avec un message explicatif dans le state.

import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Protège une route.
 *
 * Props :
 *   requireCompleteProfile (bool) — exige profile_complete === true.
 *     Si non, redirige vers /profile avec un banner d'avertissement.
 */
export default function ProtectedRoute({ children, requireCompleteProfile = false }) {
  const { isAuthenticated, loading, user } = useAuth();

  // Spinner pendant le chargement Firebase
  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={styles.label}>Chargement...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Non connecté → login
  if (!isAuthenticated) {
    window.location.hash = '#/login';
    return null;
  }

  // Connecté mais profil incomplet et profil requis → profil
  if (requireCompleteProfile && user && !user.profile_complete) {
    window.location.hash = '#/profile';
    return null;
  }

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