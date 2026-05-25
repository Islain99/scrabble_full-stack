// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle, error, clearError, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEmail = async (e) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      window.location.hash = '#/';
    } catch {
      // l'erreur est dans AuthContext.error
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    clearError();
    try {
      const result = await signInWithGoogle();
      if (result) window.location.hash = '#/';
    } catch {
        // erreur dans AuthContext.error
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>SCRABBLE</h1>
          <div style={styles.goldBar} />
          <p style={styles.subtitle}>Connexion</p>
        </div>

        {/* Erreur */}
        {error && (
          <div style={styles.errorBanner}>
            <span>⚠ {error}</span>
            <button onClick={clearError} style={styles.errorClose}>✕</button>
          </div>
        )}

        {/* Formulaire email */}
        <form onSubmit={handleEmail} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
              placeholder="vous@exemple.com"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={submitting} style={styles.primaryBtn}>
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.divLine} />
          <span style={styles.divText}>ou</span>
          <div style={styles.divLine} />
        </div>

        {/* Google */}
        <button onClick={handleGoogle} style={styles.googleBtn}>
          <GoogleIcon />
          Continuer avec Google
        </button>

        {/* Liens */}
        <div style={styles.links}>
          <a href="#/register" style={styles.link}>Créer un compte</a>
          <span style={{ color: '#C8A830' }}>·</span>
          <a href="#/reset-password" style={styles.link}>Mot de passe oublié ?</a>
        </div>

      </div>
    </div>
  );
}

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: '#F5EDD6',
    backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(200,128,58,0.07) 39px,rgba(200,128,58,0.07) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(200,128,58,0.07) 39px,rgba(200,128,58,0.07) 40px)',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#F5EDD6',
    border: '3px solid #1E1A12',
    borderRadius: '2px',
    padding: '2rem',
    boxShadow: '6px 6px 0 #C8803A',
  },
  header: { textAlign: 'center', marginBottom: '1.5rem' },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '3rem',
    fontWeight: 900,
    color: '#1E1A12',
    letterSpacing: '-0.04em',
    margin: 0,
  },
  goldBar: { height: '3px', background: '#C8803A', borderRadius: '2px', margin: '10px auto', width: '80px' },
  subtitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    color: '#8A7E65',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    margin: 0,
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#FFF0EE',
    border: '1.5px solid #8B2020',
    borderRadius: '2px',
    padding: '10px 12px',
    marginBottom: '1rem',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    color: '#8B2020',
  },
  errorClose: { background: 'none', border: 'none', color: '#8B2020', cursor: 'pointer', fontSize: '0.8rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.62rem',
    color: '#8A7E65',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  input: {
    border: '2px solid #1E1A12',
    borderRadius: '2px',
    padding: '10px 12px',
    fontFamily: "'Libre Baskerville', serif",
    fontSize: '0.95rem',
    color: '#1E1A12',
    background: '#EDE0C0',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    marginTop: '4px',
    background: '#5E6B3A',
    color: '#F5EDD6',
    border: '2px solid #3D4A20',
    borderRadius: '2px',
    padding: '12px',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '3px 3px 0 #2A3010',
    width: '100%',
  },
  divider: { display: 'flex', alignItems: 'center', gap: '10px', margin: '1rem 0' },
  divLine: { flex: 1, height: '1px', background: '#C8A830', opacity: 0.4 },
  divText: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.6rem',
    color: '#8A7E65',
    letterSpacing: '0.1em',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    background: '#F5EDD6',
    border: '2px solid #1E1A12',
    borderRadius: '2px',
    padding: '11px',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.68rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    color: '#1E1A12',
    cursor: 'pointer',
    boxShadow: '3px 3px 0 #8A7E65',
    marginBottom: '1.2rem',
  },
  links: { display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center' },
  link: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.62rem',
    color: '#C8803A',
    letterSpacing: '0.05em',
    textDecoration: 'underline',
  },
};