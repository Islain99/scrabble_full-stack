// src/pages/ProfilePage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getHistory } from '../api/authService';

export default function ProfilePage() {
  const { user, token, updateUserProfile } = useAuth();
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    getHistory(token, 10)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [token]);

  useEffect(() => {
    if (user) setForm({ displayName: user.display_name, bio: user.bio || '' });
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      await updateUserProfile({ displayName: form.displayName, bio: form.bio });
      setSaveMsg('Profil mis à jour !');
      setEditing(false);
    } catch {
      setSaveMsg('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const winRate = user.games_played > 0
    ? Math.round(user.games_won / user.games_played * 100)
    : 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* ── Profil card ─────────────────────────────────── */}
        <div style={styles.profileCard}>
          <div style={styles.profileTop}>
            {/* Avatar */}
            <div style={styles.avatar}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" style={styles.avatarImg} />
              ) : (
                <span style={styles.avatarInitial}>
                  {user.display_name?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div style={styles.profileInfo}>
              <h2 style={styles.displayName}>{user.display_name}</h2>
              <p style={styles.email}>{user.email}</p>
              <span style={styles.providerBadge}>
                {user.auth_provider === 'google.com' ? '🔵 Google' : '✉ Email'}
              </span>
            </div>
            <button onClick={() => setEditing(!editing)} style={styles.editBtn}>
              {editing ? 'Annuler' : 'Modifier'}
            </button>
          </div>

          {user.bio && !editing && (
            <p style={styles.bio}>{user.bio}</p>
          )}

          {/* Formulaire édition */}
          {editing && (
            <form onSubmit={handleSave} style={styles.editForm}>
              <div style={styles.field}>
                <label style={styles.label}>Pseudo</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  style={styles.input}
                  maxLength={32}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Bio (280 caractères max)</label>
                <textarea
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  style={{ ...styles.input, height: '80px', resize: 'vertical' }}
                  maxLength={280}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={saving} style={styles.saveBtn}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
              {saveMsg && (
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#5E6B3A', marginTop: '8px' }}>
                  {saveMsg}
                </p>
              )}
            </form>
          )}
        </div>

        {/* ── Stats ──────────────────────────────────────── */}
        <div style={styles.statsGrid}>
          {[
            { label: 'Parties jouées', value: user.games_played },
            { label: 'Victoires',      value: user.games_won },
            { label: 'Taux de victoire', value: `${winRate}%` },
            { label: 'Meilleur score', value: user.best_score },
            { label: 'Score moyen',   value: Math.round(user.average_score) },
            { label: 'Meilleur mot',  value: user.best_word ? `${user.best_word} (${user.best_word_score}pts)` : '—' },
          ].map(stat => (
            <div key={stat.label} style={styles.statCard}>
              <div style={styles.statValue}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Historique ─────────────────────────────────── */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Historique des parties</h3>
          {historyLoading ? (
            <p style={styles.muted}>Chargement...</p>
          ) : history.length === 0 ? (
            <p style={styles.muted}>Aucune partie enregistrée. <a href="#/" style={{ color: '#C8803A' }}>Jouer maintenant →</a></p>
          ) : (
            <div style={styles.historyList}>
              {history.map(g => (
                <div key={g.id} style={styles.historyRow}>
                  <div style={styles.historyResult(g.won)}>
                    {g.won ? '✓ Victoire' : '✗ Défaite'}
                  </div>
                  <div style={styles.historyMid}>
                    <span style={styles.historyScore}>{g.user_score} pts</span>
                    <span style={styles.historyVs}>vs {g.ai_name}</span>
                    {g.best_word && (
                      <span style={styles.historyWord}>🏆 {g.best_word} ({g.best_word_score}pts)</span>
                    )}
                  </div>
                  <div style={styles.historyDate}>
                    {new Date(g.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#F5EDD6', padding: '2rem 1rem' },
  container: { maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  profileCard: {
    background: '#F5EDD6', border: '3px solid #1E1A12', borderRadius: '2px',
    padding: '1.5rem', boxShadow: '5px 5px 0 #C8803A',
  },
  profileTop: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  avatar: {
    width: '64px', height: '64px', borderRadius: '50%',
    border: '3px solid #C8A830', background: '#EDE0C0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.8rem', fontWeight: 700, color: '#1E1A12',
  },
  profileInfo: { flex: 1, minWidth: 0 },
  displayName: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700,
    color: '#1E1A12', margin: '0 0 2px', letterSpacing: '-0.02em',
  },
  email: { fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#8A7E65', margin: '0 0 6px' },
  providerBadge: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.58rem', color: '#5E6B3A',
    background: '#DDE8C0', border: '1px solid #8A9B56', borderRadius: '2px',
    padding: '2px 8px', letterSpacing: '0.05em',
  },
  editBtn: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', fontWeight: 500,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A5010',
    background: 'transparent', border: '1.5px solid #C8803A', borderRadius: '2px',
    padding: '6px 12px', cursor: 'pointer', alignSelf: 'flex-start',
  },
  bio: {
    fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic',
    color: '#5E6B3A', fontSize: '0.9rem', marginTop: '14px',
    borderTop: '1px solid rgba(200,168,48,0.3)', paddingTop: '12px',
  },
  editForm: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.6rem',
    color: '#8A7E65', letterSpacing: '0.12em', textTransform: 'uppercase',
  },
  input: {
    border: '2px solid #1E1A12', borderRadius: '2px', padding: '9px 12px',
    fontFamily: "'Libre Baskerville', serif", fontSize: '0.9rem',
    color: '#1E1A12', background: '#EDE0C0', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  saveBtn: {
    background: '#5E6B3A', color: '#F5EDD6', border: '2px solid #3D4A20',
    borderRadius: '2px', padding: '8px 20px',
    fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: '3px 3px 0 #2A3010',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px',
  },
  statCard: {
    background: '#F5EDD6', border: '2px solid #1E1A12', borderRadius: '2px',
    padding: '14px 12px', textAlign: 'center', boxShadow: '3px 3px 0 #C8803A',
  },
  statValue: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700,
    color: '#1E1A12', letterSpacing: '-0.02em', lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.58rem',
    color: '#8A7E65', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '6px',
  },
  section: {
    background: '#F5EDD6', border: '2px solid #1E1A12', borderRadius: '2px',
    padding: '1.2rem 1.4rem', boxShadow: '4px 4px 0 #C8803A',
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700,
    color: '#1E1A12', margin: '0 0 14px', letterSpacing: '-0.02em',
    borderBottom: '2px solid #C8A830', paddingBottom: '8px',
  },
  muted: { fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#8A7E65' },
  historyList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 12px', background: '#EDE0C0',
    border: '1.5px solid rgba(200,168,48,0.3)', borderRadius: '2px',
    flexWrap: 'wrap',
  },
  historyResult: (won) => ({
    fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', fontWeight: 500,
    letterSpacing: '0.05em', color: won ? '#5E6B3A' : '#8B2020',
    background: won ? '#DDE8C0' : '#FFE8E8',
    border: `1.5px solid ${won ? '#8A9B56' : '#C87070'}`,
    borderRadius: '2px', padding: '3px 8px', whiteSpace: 'nowrap',
  }),
  historyMid: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  historyScore: {
    fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: '#1E1A12',
  },
  historyVs: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: '#8A7E65' },
  historyWord: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: '#5E6B3A' },
  historyDate: { fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: '#8A7E65', flexShrink: 0 },
};