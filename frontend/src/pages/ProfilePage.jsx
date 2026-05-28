// src/pages/ProfilePage.jsx
// Profil joueur complet : nom, prénom, âge, pays, avatar, bio + stats + historique
// L'upload d'avatar utilise Firebase Storage (getStorage, ref, uploadBytes, getDownloadURL).

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getHistory } from '../api/authService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Liste de pays simplifiée (tu peux remplacer par une lib complète)
const COUNTRIES = [
  'Afghanistan','Afrique du Sud','Albanie','Algérie','Allemagne','Angola','Arabie Saoudite',
  'Argentine','Australie','Autriche','Azerbaïdjan','Bahrain','Bangladesh','Belgique','Bénin',
  'Biélorussie','Bolivie','Bosnie-Herzégovine','Brésil','Bulgarie','Burkina Faso','Burundi',
  'Cameroun','Canada','Chili','Chine','Chypre','Colombie','Congo','Corée du Sud','Costa Rica',
  'Côte d\'Ivoire','Croatie','Cuba','Danemark','Djibouti','Égypte','Émirats Arabes Unis',
  'Équateur','Espagne','Estonie','États-Unis','Éthiopie','Finlande','France','Gabon','Ghana',
  'Grèce','Guatemala','Guinée','Haïti','Honduras','Hongrie','Inde','Indonésie','Irak','Iran',
  'Irlande','Islande','Israël','Italie','Jamaïque','Japon','Jordanie','Kazakhstan','Kenya',
  'Koweit','Liban','Libye','Lituanie','Luxembourg','Madagascar','Mali','Maroc','Mauritanie',
  'Mexique','Moldavie','Mongolie','Mozambique','Myanmar','Namibie','Népal','Nicaragua',
  'Niger','Nigeria','Norvège','Nouvelle-Zélande','Oman','Ouganda','Pakistan','Palestine',
  'Panama','Paraguay','Pays-Bas','Pérou','Philippines','Pologne','Portugal','Qatar',
  'République Centrafricaine','République Tchèque','Roumanie','Royaume-Uni','Russie',
  'Rwanda','Sénégal','Serbie','Sierra Leone','Singapour','Slovaquie','Slovénie','Somalie',
  'Soudan','Sri Lanka','Suède','Suisse','Syrie','Tanzanie','Tchad','Thaïlande','Togo',
  'Tunisie','Turquie','Ukraine','Uruguay','Venezuela','Vietnam','Yémen','Zambie','Zimbabwe',
].sort();

export default function ProfilePage() {
  const { user, updateUserProfile } = useAuth();
  const [history, setHistory]           = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab]       = useState('profile'); // 'profile' | 'stats' | 'history'
  const [editing, setEditing]           = useState(!user?.profile_complete); // auto-ouvre si incomplet
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview]     = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    displayName: '',
    firstName: '',
    lastName: '',
    age: '',
    country: '',
    bio: '',
    avatarUrl: '',
  });

  // Initialise le formulaire depuis le profil chargé
  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.display_name  || '',
        firstName:   user.first_name    || '',
        lastName:    user.last_name     || '',
        age:         user.age != null   ? String(user.age) : '',
        country:     user.country       || '',
        bio:         user.bio           || '',
        avatarUrl:   user.avatar_url    || '',
      });
      setAvatarPreview(user.avatar_url || null);
    }
  }, [user]);

  // Charge l'historique
  useEffect(() => {
    getHistory(10)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Upload avatar vers Firebase Storage ──────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setSaveMsg('Image trop lourde (5 Mo max).');
      return;
    }

    // Prévisualisation locale immédiate
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);
    setUploadingAvatar(true);
    setSaveMsg('');

    try {
      const storage = getStorage();
      const storageRef = ref(storage, `avatars/${user.firebase_uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setForm(f => ({ ...f, avatarUrl: downloadUrl }));
      setAvatarPreview(downloadUrl);
      setSaveMsg('Avatar mis à jour !');
    } catch (err) {
      console.error('Erreur upload avatar:', err);
      setSaveMsg('Erreur lors de l\'upload. Réessayez.');
      setAvatarPreview(user.avatar_url || null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Sauvegarde du profil ──────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveMsg('');

    // Validation côté client
    if (!form.firstName.trim()) return setSaveMsg('Le prénom est requis.');
    if (!form.lastName.trim())  return setSaveMsg('Le nom est requis.');
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 5 || Number(form.age) > 120)
      return setSaveMsg('Âge invalide (entre 5 et 120).');
    if (!form.country) return setSaveMsg('Le pays est requis.');

    setSaving(true);
    try {
      await updateUserProfile({
        displayName: form.displayName,
        firstName:   form.firstName,
        lastName:    form.lastName,
        age:         Number(form.age),
        country:     form.country,
        bio:         form.bio,
        avatarUrl:   form.avatarUrl,
      });
      setSaveMsg('Profil sauvegardé !');
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

  const profileIncomplete = !user.profile_complete;

  return (
    <div style={s.page}>
      {/* ── Bannière profil incomplet ───────────────────────── */}
      {profileIncomplete && (
        <div style={s.incompleteBanner}>
          <span style={s.bannerIcon}>⚠️</span>
          <span style={s.bannerText}>
            Complétez votre profil pour accéder au jeu — nom, prénom, âge et pays sont requis.
          </span>
          <button style={s.bannerBtn} onClick={() => { setActiveTab('profile'); setEditing(true); }}>
            Compléter maintenant
          </button>
        </div>
      )}

      <div style={s.container}>

        {/* ── Header identité ─────────────────────────────── */}
        <div style={s.header}>
          {/* Avatar zone */}
          <div style={s.avatarZone}>
            <div style={s.avatarWrap}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" style={s.avatarImg} />
              ) : (
                <span style={s.avatarInitial}>
                  {user.display_name?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
              {uploadingAvatar && <div style={s.avatarLoader} />}
            </div>
            <button
              style={s.changeAvatarBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? 'Upload...' : 'Changer'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>

          {/* Identité */}
          <div style={s.identity}>
            <h1 style={s.displayName}>{user.display_name}</h1>
            {(user.first_name || user.last_name) && (
              <p style={s.fullName}>{user.first_name} {user.last_name}</p>
            )}
            <div style={s.badges}>
              {user.country && <span style={s.badge}>📍 {user.country}</span>}
              {user.age && <span style={s.badge}>🎂 {user.age} ans</span>}
              <span style={s.badge}>
                {user.auth_provider === 'google.com' ? '🔵 Google' : '✉ Email'}
              </span>
              {user.profile_complete
                ? <span style={{...s.badge, ...s.badgeGreen}}>✓ Profil complet</span>
                : <span style={{...s.badge, ...s.badgeOrange}}>⚠ Profil incomplet</span>
              }
            </div>
            {user.bio && <p style={s.bio}>{user.bio}</p>}
          </div>

          {/* Bouton édition */}
          <button style={s.editBtn} onClick={() => { setEditing(!editing); setActiveTab('profile'); }}>
            {editing ? 'Annuler' : 'Modifier le profil'}
          </button>
        </div>

        {/* ── Tabs ────────────────────────────────────────── */}
        <div style={s.tabs}>
          {[
            { id: 'profile', label: 'Profil' },
            { id: 'stats',   label: 'Statistiques' },
            { id: 'history', label: 'Historique' },
          ].map(tab => (
            <button
              key={tab.id}
              style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Onglet Profil ────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div style={s.card}>
            {!editing ? (
              /* Vue lecture */
              <div style={s.readGrid}>
                <Field label="Prénom"    value={user.first_name || '—'} />
                <Field label="Nom"       value={user.last_name  || '—'} />
                <Field label="Pseudo"    value={user.display_name} />
                <Field label="Âge"       value={user.age ? `${user.age} ans` : '—'} />
                <Field label="Pays"      value={user.country    || '—'} />
                <Field label="Email"     value={user.email} />
                <Field label="Bio" value={user.bio || '—'} wide />
              </div>
            ) : (
              /* Formulaire édition */
              <form onSubmit={handleSave} style={s.form}>
                <div style={s.formGrid}>
                  <FormField label="Prénom *" required>
                    <input
                      style={s.input}
                      value={form.firstName}
                      onChange={set('firstName')}
                      placeholder="Jean"
                      maxLength={64}
                      required
                    />
                  </FormField>
                  <FormField label="Nom *" required>
                    <input
                      style={s.input}
                      value={form.lastName}
                      onChange={set('lastName')}
                      placeholder="Dupont"
                      maxLength={64}
                      required
                    />
                  </FormField>
                  <FormField label="Pseudo *" required>
                    <input
                      style={s.input}
                      value={form.displayName}
                      onChange={set('displayName')}
                      placeholder="ScrabbleMaster"
                      maxLength={32}
                      required
                    />
                  </FormField>
                  <FormField label="Âge *" required>
                    <input
                      style={s.input}
                      type="number"
                      value={form.age}
                      onChange={set('age')}
                      placeholder="25"
                      min={5}
                      max={120}
                      required
                    />
                  </FormField>
                  <FormField label="Pays / Région *" required wide>
                    <select style={s.input} value={form.country} onChange={set('country')} required>
                      <option value="">— Sélectionnez votre pays —</option>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Bio (optionnel)" wide>
                    <textarea
                      style={{ ...s.input, height: '80px', resize: 'vertical' }}
                      value={form.bio}
                      onChange={set('bio')}
                      placeholder="Quelques mots sur vous..."
                      maxLength={280}
                    />
                  </FormField>
                </div>

                <div style={s.formActions}>
                  <button type="submit" style={s.saveBtn} disabled={saving}>
                    {saving ? 'Sauvegarde...' : 'Sauvegarder le profil'}
                  </button>
                  {saveMsg && (
                    <span style={{
                      ...s.saveMsg,
                      color: saveMsg.includes('Erreur') ? '#8B2020' : '#5E6B3A',
                    }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── Onglet Stats ─────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div style={s.statsGrid}>
            <StatCard label="Parties jouées" value={user.games_played} icon="🎲" />
            <StatCard label="Victoires"      value={user.games_won}    icon="🏆" />
            <StatCard label="Taux de victoire" value={`${winRate}%`}  icon="📊" />
            <StatCard label="Meilleur score" value={user.best_score}   icon="⭐" />
            <StatCard label="Score moyen"    value={Math.round(user.average_score)} icon="📈" />
            <StatCard
              label="Meilleur mot"
              value={user.best_word ? `${user.best_word} (${user.best_word_score} pts)` : '—'}
              icon="✏️"
            />
          </div>
        )}

        {/* ── Onglet Historique ─────────────────────────────── */}
        {activeTab === 'history' && (
          <div style={s.card}>
            {historyLoading ? (
              <div style={s.loadingBox}>
                <div style={s.spinner} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : history.length === 0 ? (
              <p style={s.empty}>Aucune partie enregistrée pour l'instant.</p>
            ) : (
              <div style={s.historyList}>
                <div style={s.historyHead}>
                  <span>Date</span>
                  <span>Adversaire</span>
                  <span>Score</span>
                  <span>Résultat</span>
                  <span>Meilleur mot</span>
                </div>
                {history.map(g => (
                  <div key={g.id} style={{ ...s.historyRow, ...(g.won ? s.historyWon : s.historyLost) }}>
                    <span style={s.historyDate}>
                      {new Date(g.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                    <span>{g.ai_name} ({g.ai_difficulty})</span>
                    <span>{g.user_score} — {g.ai_score}</span>
                    <span style={{ fontWeight: 700, color: g.won ? '#5E6B3A' : '#8B2020' }}>
                      {g.won ? '✓ Victoire' : '✗ Défaite'}
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem' }}>
                      {g.best_word ? `${g.best_word} (+${g.best_word_score})` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────

function Field({ label, value, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <p style={s.fieldLabel}>{label}</p>
      <p style={s.fieldValue}>{value}</p>
    </div>
  );
}

function FormField({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div style={s.statCard}>
      <span style={s.statIcon}>{icon}</span>
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: '#F5EDD6',
    padding: '0 0 60px',
  },
  incompleteBanner: {
    background: '#FFF3CD',
    borderBottom: '2px solid #C8A830',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  bannerIcon: { fontSize: '1.1rem' },
  bannerText: {
    flex: 1,
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    color: '#5A4500',
    letterSpacing: '0.05em',
  },
  bannerBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    background: '#C8A830',
    color: '#1E1A12',
    border: '2px solid #8A7010',
    borderRadius: '2px',
    padding: '6px 14px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '24px',
    marginBottom: '32px',
    background: '#FFFBF0',
    border: '3px solid #1E1A12',
    borderRadius: '4px',
    padding: '24px',
    boxShadow: '4px 4px 0 #1E1A12',
    flexWrap: 'wrap',
  },
  avatarZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  avatarWrap: {
    width: '90px',
    height: '90px',
    borderRadius: '50%',
    border: '3px solid #C8A830',
    overflow: 'hidden',
    background: '#EDE0C0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '2.2rem',
    fontWeight: 700,
    color: '#1E1A12',
  },
  avatarLoader: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,251,240,0.7)',
    borderRadius: '50%',
  },
  changeAvatarBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.6rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    background: 'transparent',
    border: '1.5px solid #C8A830',
    borderRadius: '2px',
    padding: '3px 10px',
    cursor: 'pointer',
  },
  identity: { flex: 1, minWidth: '180px' },
  displayName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.6rem',
    fontWeight: 900,
    color: '#1E1A12',
    margin: '0 0 4px',
  },
  fullName: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.75rem',
    color: '#8A7E65',
    margin: '0 0 8px',
    letterSpacing: '0.05em',
  },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' },
  badge: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.6rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '3px 8px',
    border: '1.5px solid #C8A830',
    borderRadius: '2px',
    color: '#5A4500',
    background: '#FFF3CD',
  },
  badgeGreen: { borderColor: '#5E6B3A', color: '#3D4A20', background: '#EAF0D8' },
  badgeOrange: { borderColor: '#C8A830', color: '#7A5A00', background: '#FFF3CD' },
  bio: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '0.85rem',
    color: '#5A4A30',
    fontStyle: 'italic',
    margin: '8px 0 0',
  },
  editBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#1E1A12',
    background: '#EDE0C0',
    border: '2px solid #1E1A12',
    borderRadius: '2px',
    padding: '7px 14px',
    cursor: 'pointer',
    boxShadow: '2px 2px 0 #1E1A12',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    borderBottom: '3px solid #1E1A12',
    marginBottom: '24px',
  },
  tab: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.68rem',
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '10px 20px',
    border: 'none',
    borderBottom: '3px solid transparent',
    background: 'transparent',
    color: '#8A7E65',
    cursor: 'pointer',
    marginBottom: '-3px',
  },
  tabActive: {
    color: '#1E1A12',
    borderBottomColor: '#C8A830',
    background: '#FFFBF0',
  },
  card: {
    background: '#FFFBF0',
    border: '3px solid #1E1A12',
    borderRadius: '4px',
    padding: '28px',
    boxShadow: '4px 4px 0 #1E1A12',
  },
  readGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px 32px',
  },
  fieldLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.6rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    margin: '0 0 4px',
  },
  fieldValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1rem',
    color: '#1E1A12',
    margin: 0,
    fontWeight: 600,
  },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px 24px',
  },
  label: {
    display: 'block',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.6rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.82rem',
    color: '#1E1A12',
    background: '#F5EDD6',
    border: '2px solid #C8A830',
    borderRadius: '2px',
    padding: '8px 12px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  formActions: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  saveBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#F5EDD6',
    background: '#5E6B3A',
    border: '2px solid #3D4A20',
    borderRadius: '2px',
    padding: '10px 24px',
    cursor: 'pointer',
    boxShadow: '3px 3px 0 #2A3010',
  },
  saveMsg: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    letterSpacing: '0.05em',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
    gap: '16px',
  },
  statCard: {
    background: '#FFFBF0',
    border: '3px solid #1E1A12',
    borderRadius: '4px',
    padding: '20px 16px',
    boxShadow: '3px 3px 0 #1E1A12',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    textAlign: 'center',
  },
  statIcon: { fontSize: '1.5rem' },
  statValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.6rem',
    fontWeight: 900,
    color: '#1E1A12',
  },
  statLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.58rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#8A7E65',
  },
  loadingBox: { display: 'flex', justifyContent: 'center', padding: '40px' },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #C8A830',
    borderTopColor: '#1E1A12',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    color: '#8A7E65',
    textAlign: 'center',
    padding: '32px',
  },
  historyList: { display: 'flex', flexDirection: 'column', gap: '0' },
  historyHead: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 100px 100px 1fr',
    gap: '8px',
    padding: '8px 12px',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.58rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    borderBottom: '2px solid #C8A830',
    marginBottom: '4px',
  },
  historyRow: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 100px 100px 1fr',
    gap: '8px',
    padding: '10px 12px',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.72rem',
    color: '#1E1A12',
    borderBottom: '1px solid #EDE0C0',
    alignItems: 'center',
  },
  historyWon:  { background: 'rgba(94,107,58,0.06)' },
  historyLost: { background: 'transparent' },
  historyDate: { color: '#8A7E65', fontSize: '0.65rem' },
};