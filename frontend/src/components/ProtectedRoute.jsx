// src/components/ProtectedRoute.jsx
import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Protège une page : redirige vers /login si non connecté.
 * Affiche un spinner pendant le chargement initial Firebase.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5EDD6',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #C8A830',
            borderTopColor: '#1E1A12',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.7rem',
            color: '#8A7E65',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            Chargement...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Pas de react-router — on utilise window.location
    window.location.hash = '#/login';
    return null;
  }

  return children;
}