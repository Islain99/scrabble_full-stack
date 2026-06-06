// src/pages/ProfilePage.jsx
// Refactorisé : styles inline hardcodés → composants ui/ + classes s-
// La logique (upload, save, fetch history) est identique à l'original.

import React, { useState, useEffect, useRef } from 'react';
import { useAuth }    from '../context/AuthContext';
import { getHistory } from '../api/authService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, PageHeader, MonoLabel, RetroButton, Spinner, Badge, Divider, Input } from '../components/ui';

// ── Pays ──────────────────────────────────────────────────────────
const COUNTRIES = [
  'Afghanistan','Afrique du Sud','Albanie','Algérie','Allemagne','Angola','Arabie Saoudite',
  'Argentine','Australie','Autriche','Azerbaïdjan','Bahrain','Bangladesh','Belgique','Bénin',
  'Biélorussie','Bolivie','Bosnie-Herzégovine','Brésil','Bulgarie','Burkina Faso','Burundi',
  'Cameroun','Canada','Chili','Chine','Chypre','Colombie','Congo','Corée du Sud','Costa Rica',
  "Côte d'Ivoire",'Croatie','Cuba','Danemark','Djibouti','Égypte','Émirats Arabes Unis',
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

// ── Sous-composants ───────────────────────────────────────────────

/** Champ lecture seule dans la grille du profil */
function Field({ label, value, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <MonoLabel size="xs" style={{ letterSpacing: '0.15em', display: 'block', marginBottom: '4px' }}>
        {label}
      </MonoLabel>
      <p style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '1rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: 0,
      }}>
        {value}
      </p>
    </div>
  );
}

/** Wrapper de champ de formulaire avec label */
function FormField({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <label style={{
        display: 'block',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '6px',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Carte statistique */
function StatCard({ label, value, icon }) {
  return (
    <Card style={{ padding: '20px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.8rem',
        fontWeight: 900,
        color: 'var(--gold)',
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {value}
      </span>
      <MonoLabel size="xs">{label}</MonoLabel>
    </Card>
  );
}

// Style partagé pour les inputs natifs du formulaire
const inputStyle = {
  width: '100%',
  fontFamily: "'DM Mono', monospace",
  fontSize: '0.82rem',
  color: 'var(--text-primary)',
  background: 'var(--bg-input)',
  border: '2px solid var(--border-primary)',
  borderRadius: '2px',
  padding: '8px 12px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

// ── Page principale ───────────────────────────────────────────────

export default function ProfilePage() {
  const { user, updateUserProfile } = useAuth();

  const [history, setHistory]               = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab]           = useState('profile');
  const [editing, setEditing]               = useState(!user?.profile_complete);
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview]   = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    displayName: '', firstName: '', lastName: '',
    age: '', country: '', bio: '', avatarUrl: '',
  });

  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.display_name || '',
        firstName:   user.first_name   || '',
        lastName:    user.last_name    || '',
        age:         user.age != null  ? String(user.age) : '',
        country:     user.country      || '',
        bio:         user.bio          || '',
        avatarUrl:   user.avatar_url   || '',
      });
      setAvatarPreview(user.avatar_url || null);
    }
  }, [user]);

  useEffect(() => {
    getHistory(10)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Upload avatar ─────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSaveMsg('Image trop lourde (5 Mo max).'); return; }
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    setSaveMsg('');
    try {
      const storage    = getStorage();
      const storageRef = ref(storage, `avatars/${user.firebase_uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm(f => ({ ...f, avatarUrl: url }));
      setAvatarPreview(url);
      setSaveMsg('Avatar mis à jour !');
    } catch {
      setSaveMsg("Erreur lors de l'upload. Réessayez.");
      setAvatarPreview(user.avatar_url || null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Sauvegarde profil ─────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveMsg('');
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
    ? Math.round((user.games_won / user.games_played) * 100)
    : 0;

  // ── Rendu ─────────────────────────────────────────────────────
  return (
    <div className="s-page" style={{ paddingBottom: '60px' }}>

      {/* Bannière profil incomplet */}
      {!user.profile_complete && (
        <div style={{
          background:   'var(--bg-card-alt)',
          borderBottom: '2px solid var(--gold)',
          padding:      '12px 24px',
          display:      'flex',
          alignItems:   'center',
          gap:          '12px',
          flexWrap:     'wrap',
        }}>
          <span style={{ fontSize: '1.1rem' }}>⚠️</span>
          <MonoLabel style={{ flex: 1 }}>
            Complétez votre profil pour apparaître dans le classement.
          </MonoLabel>
          <RetroButton
            variant="tobacco"
            onClick={() => { setEditing(true); setActiveTab('profile'); }}
          >
            Compléter
          </RetroButton>
        </div>
      )}

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>

        <PageHeader title="Mon profil" />

        {/* ── En-tête : avatar + identité ──────────────────── */}
        <Card size="lg" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>

            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div
                onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                style={{
                  width: '90px', height: '90px',
                  borderRadius: '50%',
                  border: '3px solid var(--gold)',
                  overflow: 'hidden',
                  background: 'var(--bg-page-alt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: editing ? 'pointer' : 'default',
                  position: 'relative',
                }}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {user.display_name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                }
                {uploadingAvatar && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner size={20} />
                  </div>
                )}
              </div>
              {editing && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                  <MonoLabel size="xs" style={{ cursor: 'pointer', color: 'var(--tobacco)' }}
                    onClick={() => fileInputRef.current?.click()}>
                    Changer
                  </MonoLabel>
                </>
              )}
            </div>

            {/* Identité */}
            <div style={{ flex: 1, minWidth: '180px' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.6rem', fontWeight: 900,
                color: 'var(--text-primary)',
                margin: '0 0 6px',
                letterSpacing: '-0.02em',
              }}>
                {user.display_name}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <MonoLabel>{user.auth_provider === 'google' ? '🔵 Google' : '✉ Email'}</MonoLabel>
                <Badge variant={user.profile_complete ? 'olive' : 'gold'}>
                  {user.profile_complete ? '✓ Profil complet' : '⚠ Profil incomplet'}
                </Badge>
              </div>
              {user.bio && (
                <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {user.bio}
                </p>
              )}
            </div>

            {/* Bouton édition */}
            <RetroButton
              variant={editing ? 'default' : 'tobacco'}
              onClick={() => { setEditing(!editing); setActiveTab('profile'); }}
            >
              {editing ? 'Annuler' : 'Modifier'}
            </RetroButton>
          </div>
        </Card>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', borderBottom: '3px solid var(--border-primary)', marginBottom: '20px' }}>
          {[
            { id: 'profile', label: 'Profil' },
            { id: 'stats',   label: 'Statistiques' },
            { id: 'history', label: 'Historique' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily:    "'DM Mono', monospace",
                fontSize:      '0.68rem',
                fontWeight:    500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding:       '10px 20px',
                border:        'none',
                borderBottom:  `3px solid ${activeTab === tab.id ? 'var(--gold)' : 'transparent'}`,
                background:    activeTab === tab.id ? 'var(--bg-page-alt)' : 'transparent',
                color:         activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor:        'pointer',
                marginBottom:  '-3px',
                transition:    'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Onglet Profil ─────────────────────────────────── */}
        {activeTab === 'profile' && (
          <Card style={{ padding: '28px' }}>
            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' }}>
                <Field label="Prénom"  value={user.first_name  || '—'} />
                <Field label="Nom"     value={user.last_name   || '—'} />
                <Field label="Pseudo"  value={user.display_name} />
                <Field label="Âge"     value={user.age ? `${user.age} ans` : '—'} />
                <Field label="Pays"    value={user.country     || '—'} />
                <Field label="Email"   value={user.email} />
                <Field label="Bio"     value={user.bio         || '—'} wide />
              </div>
            ) : (
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>

                  <FormField label="Prénom *">
                    <input style={inputStyle} value={form.firstName} onChange={set('firstName')} placeholder="Jean" maxLength={64} required />
                  </FormField>

                  <FormField label="Nom *">
                    <input style={inputStyle} value={form.lastName} onChange={set('lastName')} placeholder="Dupont" maxLength={64} required />
                  </FormField>

                  <FormField label="Pseudo *">
                    <input style={inputStyle} value={form.displayName} onChange={set('displayName')} placeholder="JeanD" maxLength={32} required />
                  </FormField>

                  <FormField label="Âge *">
                    <input style={inputStyle} type="number" value={form.age} onChange={set('age')} min={5} max={120} required />
                  </FormField>

                  <FormField label="Pays *" wide>
                    <select
                      value={form.country}
                      onChange={set('country')}
                      required
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">— Sélectionner —</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FormField>

                  <FormField label="Bio" wide>
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', fontFamily: "'Libre Baskerville', serif" }}
                      value={form.bio}
                      onChange={set('bio')}
                      placeholder="Quelques mots sur vous…"
                      maxLength={280}
                    />
                  </FormField>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <RetroButton variant="primary" disabled={saving}>
                    {saving ? 'Sauvegarde...' : 'Sauvegarder le profil'}
                  </RetroButton>
                  {saveMsg && (
                    <MonoLabel color={saveMsg.includes('Erreur') ? 'var(--brick)' : 'var(--olive)'}>
                      {saveMsg}
                    </MonoLabel>
                  )}
                </div>
              </form>
            )}
          </Card>
        )}

        {/* ── Onglet Stats ──────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
            <StatCard label="Parties jouées"   value={user.games_played}                            icon="🎲" />
            <StatCard label="Victoires"         value={user.games_won}                               icon="🏆" />
            <StatCard label="Taux de victoire"  value={`${winRate}%`}                                icon="📊" />
            <StatCard label="Meilleur score"    value={user.best_score}                              icon="⭐" />
            <StatCard label="Score moyen"       value={Math.round(user.average_score)}               icon="📈" />
            <StatCard label="Meilleur mot"
              value={user.best_word ? `${user.best_word} (${user.best_word_score} pts)` : '—'}      icon="✏️" />
          </div>
        )}

        {/* ── Onglet Historique ─────────────────────────────── */}
        {activeTab === 'history' && (
          <Card style={{ overflow: 'hidden' }}>
            {historyLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Spinner size={28} />
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <MonoLabel>Aucune partie enregistrée pour l'instant.</MonoLabel>
              </div>
            ) : (
              <>
                {/* En-tête tableau */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 100px 100px 1fr',
                  gap: '8px',
                  background: 'var(--bg-invert)',
                  padding: '10px 16px',
                }}>
                  {['Date', 'Adversaire', 'Score', 'Résultat', 'Meilleur mot'].map(h => (
                    <MonoLabel key={h} color="var(--gold)" style={{ fontSize: '0.55rem' }}>{h}</MonoLabel>
                  ))}
                </div>

                {history.map(g => (
                  <div
                    key={g.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr 100px 100px 1fr',
                      gap: '8px',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-muted)',
                      background: g.won ? 'rgba(94,107,58,0.05)' : 'rgba(139,32,32,0.04)',
                      alignItems: 'center',
                    }}
                  >
                    <MonoLabel size="xs">
                      {new Date(g.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </MonoLabel>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {g.ai_name} <MonoLabel size="xs">({g.ai_difficulty})</MonoLabel>
                    </span>
                    <MonoLabel>{g.user_score} — {g.ai_score}</MonoLabel>
                    <Badge variant={g.won ? 'olive' : 'brick'}>
                      {g.won ? '✓ Victoire' : '✗ Défaite'}
                    </Badge>
                    <MonoLabel size="xs">
                      {g.best_word ? `${g.best_word} (+${g.best_word_score})` : '—'}
                    </MonoLabel>
                  </div>
                ))}
              </>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}