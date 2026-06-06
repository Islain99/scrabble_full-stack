// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import { useSettings }  from '../context/SettingsContext';
import { useTheme }     from '../context/ThemeContext';
import { useLanguage }  from '../context/LanguageContext';
import { LANGUAGES }    from '../i18n/translations';
import { Card, PageHeader, MonoLabel, RetroButton, Spinner } from '../components/ui';

// ── Composants internes ───────────────────────────────────────────

/** Ligne label + description + contrôle à droite */
const Row = ({ label, desc, children }) => (
  <div style={{
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    gap:            '16px',
    flexWrap:       'wrap',
  }}>
    <div style={{ flex: 1, minWidth: '160px' }}>
      <div style={{
        fontFamily:   "'Playfair Display', serif",
        fontSize:     '0.95rem',
        fontWeight:   700,
        color:        'var(--text-primary)',
        marginBottom: '2px',
      }}>
        {label}
      </div>
      {desc && (
        <MonoLabel size="xs" style={{ lineHeight: 1.5 }}>{desc}</MonoLabel>
      )}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

/** Toggle switch animé */
const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    aria-pressed={value}
    style={{
      width:        '48px',
      height:       '26px',
      borderRadius: '13px',
      border:       `2px solid ${value ? 'var(--olive)' : 'var(--border-muted)'}`,
      background:   value ? 'var(--olive)' : 'var(--bg-card-alt)',
      position:     'relative',
      cursor:       'pointer',
      transition:   'background 0.2s, border-color 0.2s',
      padding:      0,
      boxShadow:    'none',
    }}
  >
    <div style={{
      position:     'absolute',
      top:          '2px',
      left:         value ? 'calc(100% - 20px)' : '2px',
      width:        '18px',
      height:       '18px',
      borderRadius: '50%',
      background:   value ? 'var(--text-invert)' : 'var(--text-muted)',
      transition:   'left 0.2s',
      boxShadow:    '0 1px 3px rgba(0,0,0,0.3)',
    }} />
  </button>
);

/** Groupe de chips sélectionnables */
const ChipGroup = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
    {options.map(opt => {
      const key    = opt.value ?? opt.key;
      const active = key === value;
      return (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.72rem',
            fontWeight:    500,
            letterSpacing: '0.06em',
            padding:       '6px 14px',
            borderRadius:  '2px',
            border:        `2px solid ${active ? 'var(--border-primary)' : 'var(--border-muted)'}`,
            background:    active ? 'var(--bg-invert)' : 'transparent',
            color:         active ? 'var(--text-invert)' : 'var(--text-muted)',
            cursor:        'pointer',
            transition:    'all 0.15s',
            boxShadow:     active ? '2px 2px 0 var(--border-gold-dk)' : 'none',
          }}
        >
          {opt.emoji && <span style={{ marginRight: '5px' }}>{opt.emoji}</span>}
          {opt.short ?? opt.label}
        </button>
      );
    })}
  </div>
);

// ── SectionHeader interne ─────────────────────────────────────────

const SectionTitle = ({ emoji, label }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ fontSize: '1rem' }}>{emoji}</span>
    <span style={{
      fontFamily: "'Playfair Display', serif",
      fontSize:   '1rem',
      fontWeight: 700,
      color:      'var(--text-invert)',
    }}>
      {label}
    </span>
  </span>
);

// ── Page principale ───────────────────────────────────────────────

export default function SettingsPage() {
  const {
    settings, update, reset,
    TURN_OPTIONS, DIFFICULTY_META,
    syncing, lastSynced, currentUid,
  } = useSettings();

  const { preference, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ── Options traduites ─────────────────────────────────────────

  const themeOptions = [
    { value: 'light',  emoji: '☀️', label: t('theme_light')  },
    { value: 'dark',   emoji: '🌙', label: t('theme_dark')   },
    { value: 'system', emoji: '⚙️', label: t('theme_system') },
  ];

  const langOptions = LANGUAGES.map(l => ({
    value: l.value,
    label: l.label,
    emoji: l.emoji,
  }));

  // Difficultés avec labels/descs traduits
  const diffOptions = Object.entries(DIFFICULTY_META).map(([key, meta]) => ({
    key,
    emoji: meta.emoji,
    label: t(`diff_${key}_label`),
    desc:  t(`diff_${key}_desc`),
  }));

  // Durées de tour traduites
  const turnKeys = ['turn_unlimited', 'turn_1min', 'turn_2min', 'turn_3min', 'turn_5min'];
  const turnValues = [0, 60, 120, 180, 300];
  const turnOptions = TURN_OPTIONS.map((o, i) => ({
    value: o.value,
    label: t(turnKeys[i]),
    short: i === 0 ? '∞' : `${turnValues[i] / 60} min`,
  }));

  // ── Badge de synchronisation ──────────────────────────────────

  const syncLabel = syncing
    ? t('sync_syncing')
    : lastSynced
      ? `${t('sync_saved')} ${lastSynced.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : currentUid
        ? t('sync_not_synced')
        : t('sync_guest');

  const SyncBadge = () => (
    <div style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        '6px',
      marginTop:  '8px',
      padding:    '4px 10px',
      background: syncing
        ? 'var(--bg-card-alt)'
        : lastSynced
          ? 'rgba(94,107,58,0.12)'
          : 'var(--bg-card-alt)',
      border: `1px solid ${
        syncing   ? 'var(--border-muted)' :
        lastSynced ? 'var(--olive)'       :
                     'var(--border-muted)'
      }`,
      borderRadius: '2px',
    }}>
      {syncing && <Spinner size={10} />}
      <MonoLabel color={lastSynced && !syncing ? 'var(--olive)' : 'var(--text-muted)'}>
        {syncLabel}
      </MonoLabel>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="s-page">
      <div className="s-container">

        <PageHeader
          title={t('settings_title')}
          subtitle={t('settings_subtitle')}
        >
          <SyncBadge />
        </PageHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Apparence ──────────────────────────────────── */}
          <Card>
            <Card.Header>
              <SectionTitle emoji="🎨" label={t('section_appearance')} />
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <Row label={t('row_theme')} desc={t('row_theme_desc')}>
                <ChipGroup options={themeOptions} value={preference} onChange={setTheme} />
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_language')} desc={t('row_language_desc')}>
                <ChipGroup options={langOptions} value={language} onChange={setLanguage} />
              </Row>

            </Card.Body>
          </Card>

          {/* ── Partie ─────────────────────────────────────── */}
          <Card>
            <Card.Header>
              <SectionTitle emoji="🎮" label={t('section_game')} />
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <Row label={t('row_difficulty')} desc={t('row_difficulty_desc')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '260px' }}>
                  {diffOptions.map(d => {
                    const active = d.key === settings.difficulty;
                    return (
                      <button
                        key={d.key}
                        onClick={() => update('difficulty', d.key)}
                        style={{
                          display:      'flex',
                          alignItems:   'center',
                          gap:          '10px',
                          padding:      '10px 14px',
                          borderRadius: '2px',
                          border:       `2px solid ${active ? 'var(--border-primary)' : 'var(--border-muted)'}`,
                          background:   active ? 'var(--bg-invert)' : 'transparent',
                          cursor:       'pointer',
                          transition:   'all 0.15s',
                          boxShadow:    active ? '3px 3px 0 var(--border-gold-dk)' : 'none',
                          textAlign:    'left',
                        }}
                      >
                        <span style={{ fontSize: '1.1rem' }}>{d.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize:   '0.9rem',
                            fontWeight: 700,
                            color:      active ? 'var(--text-invert)' : 'var(--text-primary)',
                          }}>
                            {d.label}
                          </div>
                          <MonoLabel
                            size="xs"
                            color={active ? 'var(--text-invert-muted)' : 'var(--text-muted)'}
                            style={{ letterSpacing: '0.04em', marginTop: '2px' }}
                          >
                            {d.desc}
                          </MonoLabel>
                        </div>
                        {active && (
                          <span style={{ color: 'var(--gold)', fontSize: '1rem' }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_turn_duration')} desc={t('row_turn_duration_desc')}>
                <ChipGroup
                  options={turnOptions}
                  value={settings.turnDuration}
                  onChange={v => update('turnDuration', v)}
                />
              </Row>

            </Card.Body>
          </Card>

          {/* ── Affichage ──────────────────────────────────── */}
          <Card>
            <Card.Header>
              <SectionTitle emoji="👁️" label={t('section_display')} />
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <Row label={t('row_score_preview')} desc={t('row_score_preview_desc')}>
                <Toggle
                  value={settings.showScorePreview}
                  onChange={v => update('showScorePreview', v)}
                />
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_remaining_tiles')} desc={t('row_remaining_tiles_desc')}>
                <Toggle
                  value={settings.showRemainingTiles}
                  onChange={v => update('showRemainingTiles', v)}
                />
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_bonus_labels')} desc={t('row_bonus_labels_desc')}>
                <Toggle
                  value={settings.showBonusLabels}
                  onChange={v => update('showBonusLabels', v)}
                />
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_animations')} desc={t('row_animations_desc')}>
                <Toggle
                  value={settings.animationsEnabled}
                  onChange={v => update('animationsEnabled', v)}
                />
              </Row>

            </Card.Body>
          </Card>

          {/* ── Comportement ───────────────────────────────── */}
          <Card>
            <Card.Header>
              <SectionTitle emoji="⚙️" label={t('section_behavior')} />
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <Row label={t('row_auto_sort')} desc={t('row_auto_sort_desc')}>
                <Toggle
                  value={settings.autoSortRack}
                  onChange={v => update('autoSortRack', v)}
                />
              </Row>

              <div style={{ borderTop: '1px solid var(--border-muted)' }} />

              <Row label={t('row_confirm_validation')} desc={t('row_confirm_validation_desc')}>
                <Toggle
                  value={settings.confirmValidation}
                  onChange={v => update('confirmValidation', v)}
                />
              </Row>

            </Card.Body>
          </Card>

          {/* ── Réinitialiser ──────────────────────────────── */}
          <div style={{ textAlign: 'right', paddingBottom: '2rem' }}>
            {showResetConfirm ? (
              <div style={{
                display:     'flex',
                gap:         '10px',
                justifyContent: 'flex-end',
                alignItems:  'center',
              }}>
                <MonoLabel>{t('confirm_reset')}</MonoLabel>
                <RetroButton
                  variant="default"
                  onClick={() => setShowResetConfirm(false)}
                >
                  {t('btn_cancel')}
                </RetroButton>
                <RetroButton
                  variant="danger"
                  onClick={() => { reset(); setShowResetConfirm(false); }}
                >
                  {t('btn_confirm_reset')}
                </RetroButton>
              </div>
            ) : (
              <RetroButton
                variant="default"
                onClick={() => setShowResetConfirm(true)}
              >
                {t('btn_reset')}
              </RetroButton>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}