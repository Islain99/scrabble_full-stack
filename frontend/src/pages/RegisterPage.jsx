// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, MonoLabel, Input, RetroButton, Spinner, Divider } from '../components/ui';

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default function RegisterPage() {
  const { signUpWithEmail, signInWithGoogle, error, clearError } = useAuth();
  const [form, setForm]           = useState({ displayName: '', email: '', password: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setFieldError(''); };

  const validate = () => {
    if (form.displayName.trim().length < 2)  return 'Le pseudo doit contenir au moins 2 caractères.';
    if (form.displayName.trim().length > 32) return 'Le pseudo ne peut pas dépasser 32 caractères.';
    if (!form.email.includes('@'))           return 'Email invalide.';
    if (form.password.length < 6)            return 'Mot de passe trop court (6 caractères minimum).';
    if (form.password !== form.confirm)      return 'Les mots de passe ne correspondent pas.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const err = validate();
    if (err) { setFieldError(err); return; }
    setSubmitting(true);
    try {
      await signUpWithEmail(form.email, form.password, form.displayName.trim());
      window.location.hash = '#/';
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    clearError();
    try {
      const result = await signInWithGoogle();
      if (result) window.location.hash = '#/';
    } catch { /* error dans AuthContext */ }
  };

  const anyError = fieldError || error;

  return (
    <div className="s-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card size="lg" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem' }}>

        {/* Masthead */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: 'var(--text-primary)' }}>
            SCRABBLE
          </h1>
          <div className="s-gold-bar" style={{ margin: '10px auto' }} />
          <MonoLabel size="sm" color="var(--text-muted)">Créer un compte</MonoLabel>
        </div>

        {/* Bannière d'erreur */}
        {anyError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(139,32,32,0.08)', border: '1.5px solid var(--brick)', borderRadius: '2px', padding: '10px 14px', marginBottom: '1.5rem', gap: '8px' }}>
            <MonoLabel color="var(--brick)">⚠ {anyError}</MonoLabel>
            <button onClick={() => { clearError(); setFieldError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brick)', fontSize: '1rem', lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Pseudo"
            type="text"
            value={form.displayName}
            onChange={set('displayName')}
            placeholder="Votre nom de joueur"
            autoComplete="username"
            required
          />
          <Input
            label="Adresse email"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="vous@exemple.com"
            autoComplete="email"
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder="6 caractères minimum"
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirmer le mot de passe"
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <RetroButton variant="primary" fullWidth disabled={submitting}>
            {submitting
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Spinner size={12} color="var(--text-invert)" /> Création…</span>
              : 'Créer mon compte'}
          </RetroButton>
        </form>

        {/* Séparateur */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '1.5rem 0' }}>
          <Divider style={{ flex: 1 }} />
          <MonoLabel>ou</MonoLabel>
          <Divider style={{ flex: 1 }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '11px 18px', background: 'var(--bg-card-alt)', border: '2px solid var(--border-muted)', borderRadius: '2px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--text-primary)', transition: 'border-color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-muted)'}
        >
          <GoogleIcon />
          Continuer avec Google
        </button>

        {/* Lien connexion */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <MonoLabel color="var(--text-muted)" style={{ marginRight: '8px' }}>Déjà un compte ?</MonoLabel>
          <a href="#/login" style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: 'var(--tobacco)', letterSpacing: '0.06em' }}>
            Se connecter
          </a>
        </div>

      </Card>
    </div>
  );
}