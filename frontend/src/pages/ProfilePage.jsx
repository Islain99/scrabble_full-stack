// src/pages/ProfilePage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth }    from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getHistory } from '../api/authService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, PageHeader, MonoLabel, RetroButton, Spinner, Badge } from '../components/ui';

// ── Pays (liste statique, pas besoin de traduction) ───────────────
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

// ── Styles partagés ───────────────────────────────────────────────
const inputStyle = {
  width:        '100%',
  fontFamily:   "'DM Mono', monospace",
  fontSize:     '0.82rem',
  color:        'var(--text-primary)',
  background:   'var(--bg-input)',
  border:       '2px solid var(--border-primary)',
  borderRadius: '2px',
  padding:      '8px 12px',
  outline:      'none',
  boxSizing:    'border-box',
  transition:   'border-color 0.15s',
};

// ── Sous-composants ───────────────────────────────────────────────

function Field({ label, value, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <MonoLabel size="xs" style={{ letterSpacing: '0.15em', display: 'block', marginBottom: '4px' }}>
        {label}
      </MonoLabel>
      <p style={{
        fontFamily: "'Playfair Display', serif",
        fontSize:   '1rem',
        fontWeight: 600,
        color:      'var(--text-primary)',
        margin:     0,
      }}>
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'span 1' }}>
      <label style={{
        display:       'block',
        fontFamily:    "'DM Mono', monospace",
        fontSize:      '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         'var(--text-muted)',
        marginBottom:  '6px',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <Card style={{
      padding:        '20px 16px',
      textAlign:      'center',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      gap:            '6px',
    }}>
      <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontFamily:    "'Playfair Display', serif",
        fontSize:      '1.8rem',
        fontWeight:    900,
        color:         'var(--gold)',
        lineHeight:    1,
        letterSpacing: '-0.02em',
      }}>
        {value}
      </span>
      <MonoLabel size="xs">{label}</MonoLabel>
    </Card>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function ProfilePage() {
  const { user, updateUserProfile } = useAuth();
  const { t, language }             = useLanguage();

  const [history, setHistory]                 = useState([]);
  const [historyLoading, setHistoryLoading]   = useState(true);
  const [activeTab, setActiveTab]             = useState('profile');
  const [editing, setEditing]                 = useState(!user?.profile_complete);
  const [saving, setSaving]                   = useState(false);
  const [saveMsg, setSaveMsg]                 = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview]     = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    displayName: '', firstName: '', lastName: '',
    age: '', country: '', bio: '', avatarUrl: '',
  });

  // Hydrate le formulaire depuis user
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
    }
  }, [user]);

  // Charge l'historique
  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    try {
      const storage  = getStorage();
      const fileRef  = ref(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setForm(f => ({ ...f, avatarUrl: url }));
    } catch (err) {
      console.error('Avatar upload error:', err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveMsg('');
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
      setSaveMsg(t('profile_save_success'));
      setEditing(false);
    } catch {
      setSaveMsg(t('profile_save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const winRate = user.games_played > 0
    ? Math.round((user.games_won / user.games_played) * 100)
    : 0;

  // En-têtes du tableau historique (traduits)
  const historyHeaders = [
    t('history_date'),
    t('history_opponent'),
    t('history_score'),
    t('history_result'),
    t('history_best_word'),
  ];

  // Onglets (traduits)
  const TABS = [
    { id: 'profile', label: t('tab_profile')  },
    { id: 'stats',   label: t('tab_stats')    },
    { id: 'history', label: t('tab_history')  },
  ];

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
            {t('profile_incomplete_banner')}
          </MonoLabel>
          <RetroButton
            variant="tobacco"
            onClick={() => { setEditing(true); setActiveTab('profile'); }}
          >
            {t('profile_complete_btn')}
          </RetroButton>
        </div>
      )}

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>

        <PageHeader title={t('profile_title')} />

        {/* ── En-tête avatar + identité ─────────────────────── */}
        <Card size="lg" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>

            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div
                onClick={() => editing && !uploadingAvatar && fileInputRef.current?.click()}
                style={{
                  width:          '90px',
                  height:         '90px',
                  borderRadius:   '50%',
                  border:         '3px solid var(--gold)',
                  overflow:       'hidden',
                  background:     'var(--bg-page-alt)',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  cursor:         editing ? 'pointer' : 'default',
                  position:       'relative',
                }}
              >
                {uploadingAvatar ? (
                  <Spinner size={24} />
                ) : avatarPreview || user.avatar_url ? (
                  <img
                    src={avatarPreview ?? user.avatar_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize:   '2rem',
                    fontWeight: 700,
                    color:      'var(--text-primary)',
                  }}>
                    {user.display_name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
              {editing && (
                <MonoLabel size="xs" style={{ cursor: 'pointer', color: 'var(--tobacco)' }}
                  onClick={() => fileInputRef.current?.click()}>
                  {t('profile_change_avatar')}
                </MonoLabel>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            {/* Identité */}
            <div style={{ flex: 1, minWidth: '180px' }}>
              <h2 style={{
                fontFamily:    "'Playfair Display', serif",
                fontSize:      '1.8rem',
                fontWeight:    900,
                color:         'var(--text-primary)',
                letterSpacing: '-0.03em',
                margin:        '0 0 4px',
              }}>
                {user.display_name}
              </h2>
              <MonoLabel size="xs" style={{ marginBottom: '8px' }}>
                {user.email}
              </MonoLabel>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {user.country && (
                  <Badge variant="default">{user.country}</Badge>
                )}
                <Badge variant={user.profile_complete ? 'success' : 'warn'}>
                  {user.profile_complete ? t('profile_complete_badge') : t('profile_incomplete_badge')}
                </Badge>
              </div>
              {user.bio && (
                <p style={{
                  fontFamily: "'Libre Baskerville', serif",
                  fontStyle:  'italic',
                  fontSize:   '0.9rem',
                  color:      'var(--text-secondary)',
                  margin:     0,
                }}>
                  {user.bio}
                </p>
              )}
            </div>

            {/* Bouton édition */}
            <RetroButton
              variant={editing ? 'default' : 'tobacco'}
              onClick={() => { setEditing(!editing); setActiveTab('profile'); }}
            >
              {editing ? t('btn_cancel') : t('profile_edit_btn')}
            </RetroButton>
          </div>
        </Card>

        {/* ── Onglets ───────────────────────────────────────── */}
        <div style={{
          display:      'flex',
          borderBottom: '3px solid var(--border-primary)',
          marginBottom: '20px',
        }}>
          {TABS.map(tab => (
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
              // Lecture seule
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' }}>
                <Field label={t('field_firstname')}  value={user.first_name  || '—'} />
                <Field label={t('field_lastname')}   value={user.last_name   || '—'} />
                <Field label={t('field_username')}   value={user.display_name} />
                <Field label={t('field_age')}        value={user.age ? `${user.age} ${t('field_age_unit')}` : '—'} />
                <Field label={t('field_country')}    value={user.country    || '—'} />
                <Field label={t('field_email')}      value={user.email} />
                <Field label={t('field_bio')} wide   value={user.bio || '—'} />
              </div>
            ) : (
              // Formulaire d'édition
              <form onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px' }}>
                  <FormField label={t('field_firstname')}>
                    <input
                      style={inputStyle}
                      value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      placeholder={t('field_firstname')}
                    />
                  </FormField>
                  <FormField label={t('field_lastname')}>
                    <input
                      style={inputStyle}
                      value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      placeholder={t('field_lastname')}
                    />
                  </FormField>
                  <FormField label={t('field_username')}>
                    <input
                      style={inputStyle}
                      value={form.displayName}
                      onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                      placeholder={t('field_username')}
                      required
                    />
                  </FormField>
                  <FormField label={t('field_age')}>
                    <input
                      style={inputStyle}
                      type="number"
                      min="5"
                      max="120"
                      value={form.age}
                      onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                      placeholder="—"
                    />
                  </FormField>
                  <FormField label={t('field_country')} wide>
                    <select
                      style={inputStyle}
                      value={form.country}
                      onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    >
                      <option value="">{t('field_country_placeholder')}</option>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label={t('field_bio')} wide>
                    <textarea
                      style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder={t('field_bio_placeholder')}
                      maxLength={300}
                    />
                  </FormField>
                </div>

                <div style={{
                  display:        'flex',
                  gap:            '10px',
                  marginTop:      '20px',
                  justifyContent: 'flex-end',
                  alignItems:     'center',
                }}>
                  <RetroButton type="submit" variant="primary" disabled={saving}>
                    {saving ? t('profile_saving') : t('profile_save_btn')}
                  </RetroButton>
                  {saveMsg && (
                    <MonoLabel color={saveMsg === t('profile_save_success') ? 'var(--olive)' : 'var(--brick)'}>
                      {saveMsg}
                    </MonoLabel>
                  )}
                </div>
              </form>
            )}
          </Card>
        )}

        {/* ── Onglet Statistiques ───────────────────────────── */}
        {activeTab === 'stats' && (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap:                 '16px',
          }}>
            <StatCard label={t('stat_games_played')} value={user.games_played}                                     icon="🎲" />
            <StatCard label={t('stat_wins')}          value={user.games_won}                                        icon="🏆" />
            <StatCard label={t('stat_win_rate')}      value={`${winRate}%`}                                         icon="📊" />
            <StatCard label={t('stat_best_score')}    value={user.best_score}                                       icon="⭐" />
            <StatCard label={t('stat_avg_score')}     value={Math.round(user.average_score)}                        icon="📈" />
            <StatCard label={t('stat_best_word')}
              value={user.best_word ? `${user.best_word} (${user.best_word_score} pts)` : '—'}                      icon="✏️" />
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
                <MonoLabel>{t('history_empty')}</MonoLabel>
              </div>
            ) : (
              <>
                {/* En-tête tableau */}
                <div style={{
                  display:             'grid',
                  gridTemplateColumns: '80px 1fr 100px 100px 1fr',
                  gap:                 '8px',
                  background:          'var(--bg-invert)',
                  padding:             '10px 16px',
                }}>
                  {historyHeaders.map(h => (
                    <MonoLabel key={h} color="var(--gold)" style={{ fontSize: '0.55rem' }}>
                      {h}
                    </MonoLabel>
                  ))}
                </div>

                {history.map(g => {
                  const date = new Date(g.played_at ?? g.created_at);
                  const dateStr = date.toLocaleDateString(
                    language === 'fr' ? 'fr-FR' : 'en-GB',
                    { day: '2-digit', month: '2-digit' }
                  );
                  return (
                    <div
                      key={g.id}
                      style={{
                        display:             'grid',
                        gridTemplateColumns: '80px 1fr 100px 100px 1fr',
                        gap:                 '8px',
                        padding:             '12px 16px',
                        borderBottom:        '1px solid var(--border-muted)',
                        background:          g.won
                          ? 'rgba(94,107,58,0.06)'
                          : 'rgba(139,32,32,0.04)',
                      }}
                    >
                      <MonoLabel size="xs">{dateStr}</MonoLabel>
                      <MonoLabel size="xs">{g.ai_name}</MonoLabel>
                      <MonoLabel size="xs">
                        {g.user_score} — {g.ai_score}
                      </MonoLabel>
                      <MonoLabel
                        size="xs"
                        color={g.won ? 'var(--olive)' : 'var(--brick)'}
                      >
                        {g.won ? t('profile_victory') : t('profile_defeat')}
                      </MonoLabel>
                      <MonoLabel size="xs">
                        {g.best_word
                          ? `${g.best_word} (${g.best_word_score} pts)`
                          : '—'}
                      </MonoLabel>
                    </div>
                  );
                })}
              </>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}