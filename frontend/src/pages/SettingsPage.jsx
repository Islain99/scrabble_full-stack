// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import { useSettings }  from '../context/SettingsContext';
import { useTheme }     from '../context/ThemeContext';
import { useLanguage }  from '../context/LanguageContext';
import { useAuth }      from '../context/AuthContext';
import { LANGUAGES }    from '../i18n/translations';
import { Card, PageHeader, MonoLabel, RetroButton, Spinner } from '../components/ui';
import { Row, Toggle, SectionTitle } from '../components/settings/SettingsParts';
import NotificationsCard from '../components/settings/NotificationsCard';
import AccountCard from '../components/settings/AccountCard';
import PrivacyCard from '../components/settings/PrivacyCard';
import PalettePicker from '../components/settings/PalettePicker';
import { Managed, RowList } from '../components/settings/Managed';
import { useAppConfig } from '../context/AppConfigContext';
import { choosable } from '../utils/appConfig';

// ── Composants internes ───────────────────────────────────────────

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

// ── Page principale ───────────────────────────────────────────────

// Badge d'état de synchronisation des préférences (défini hors de la page :
// un composant créé pendant le rendu serait recréé, et remonté, à chaque fois)
function SyncBadge({ syncing, lastSynced, label }) {
  return (
    <div style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        '6px',
      marginTop:  '8px',
      padding:    '4px 10px',
      background: syncing
        ? 'var(--bg-card-alt)'
        : lastSynced
          ? 'color-mix(in srgb, var(--olive) 12%, transparent)'
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
        {label}
      </MonoLabel>
    </div>
  );
}

export default function SettingsPage() {
  const {
    settings, update, reset,
    TURN_OPTIONS, DIFFICULTY_META,
    syncing, lastSynced, currentUid,
  } = useSettings();

  const { user } = useAuth();
  const { preference, setTheme, THEMES } = useTheme();
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const { policy, isHidden, isLocked } = useAppConfig();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Lot A2 : réglage masqué → ligne absente ; verrouillé → visible, grisé, « fixé »
  const shown = (key) => !isHidden(key);

  // ── Options traduites (seulement celles que l'administrateur propose) ──

  const themeOptions = [
    { value: 'light',  emoji: '☀️', label: t('theme_light')  },
    { value: 'dark',   emoji: '🌙', label: t('theme_dark')   },
    { value: 'system', emoji: '⚙️', label: t('theme_system') },
  ].filter(o => THEMES.includes(o.value));

  const langOptions = LANGUAGES.filter(l => availableLanguages.includes(l.value)).map(l => ({
    value: l.value,
    label: l.label,
    emoji: l.emoji,
  }));

  // Difficultés avec labels/descs traduits
  const allowedDiffs = choosable(policy, 'difficulty', Object.keys(DIFFICULTY_META));
  const diffOptions = Object.entries(DIFFICULTY_META).filter(([key]) => allowedDiffs.includes(key)).map(([key, meta]) => ({
    key,
    emoji: meta.emoji,
    label: t(`diff_${key}_label`),
    desc:  t(`diff_${key}_desc`),
  }));

  // Durées de tour traduites
  const turnKeys = ['turn_unlimited', 'turn_1min', 'turn_2min', 'turn_3min', 'turn_5min'];
  const turnValues = [0, 60, 120, 180, 300];
  const allowedTurns = choosable(policy, 'turnDuration', turnValues);
  const turnOptions = TURN_OPTIONS.map((o, i) => ({
    value: o.value,
    label: t(turnKeys[i]),
    short: i === 0 ? '∞' : `${turnValues[i] / 60} min`,
  })).filter(o => allowedTurns.includes(o.value));

  // Interrupteurs des sections Affichage et Comportement
  const toggleRow = (key, label) => shown(key) && (
    <Row key={key} label={t(label)} desc={t(`${label}_desc`)}>
      <Managed locked={isLocked(key)}>
        <Toggle value={settings[key]} onChange={v => update(key, v)} label={t(label)} />
      </Managed>
    </Row>
  );
  const displayRows = [
    toggleRow('showScorePreview', 'row_score_preview'),
    toggleRow('showRemainingTiles', 'row_remaining_tiles'),
    toggleRow('showBonusLabels', 'row_bonus_labels'),
    toggleRow('animationsEnabled', 'row_animations'),
  ].filter(Boolean);
  const behaviorRows = [
    toggleRow('autoSortRack', 'row_auto_sort'),
    toggleRow('confirmValidation', 'row_confirm_validation'),
  ].filter(Boolean);
  const showAppearance = ['themeMode', 'colorPalette', 'language'].some(shown);
  const showGame = ['difficulty', 'turnDuration'].some(shown);

  // ── Badge de synchronisation ──────────────────────────────────

  const syncLabel = syncing
    ? t('sync_syncing')
    : lastSynced
      ? `${t('sync_saved')} ${lastSynced.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : currentUid
        ? t('sync_not_synced')
        : t('sync_guest');

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="s-page">
      <div className="s-container">

        <PageHeader
          title={t('settings_title')}
          subtitle={t('settings_subtitle')}
        >
          <SyncBadge syncing={syncing} lastSynced={lastSynced} label={syncLabel} />
        </PageHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Apparence ──────────────────────────────────── */}
          {showAppearance && (
            <Card>
              <Card.Header>
                <SectionTitle emoji="🎨" label={t('section_appearance')} />
              </Card.Header>
              <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <RowList>
                  {shown('themeMode') && (
                    <Row key="theme" label={t('row_theme')} desc={t('row_theme_desc')}>
                      <Managed locked={isLocked('themeMode')}>
                        <ChipGroup options={themeOptions} value={preference} onChange={setTheme} />
                      </Managed>
                    </Row>
                  )}
                  {shown('colorPalette') && (
                    <div key="palette" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <Row label={t('row_palette')} desc={t('row_palette_desc')} />
                      <Managed locked={isLocked('colorPalette')}>
                        <PalettePicker />
                      </Managed>
                    </div>
                  )}
                  {shown('language') && (
                    <Row key="language" label={t('row_language')} desc={t('row_language_desc')}>
                      <Managed locked={isLocked('language')}>
                        <ChipGroup options={langOptions} value={language} onChange={setLanguage} />
                      </Managed>
                    </Row>
                  )}
                </RowList>
              </Card.Body>
            </Card>
          )}

          {/* ── Partie ─────────────────────────────────────── */}
          {showGame && (
            <Card>
              <Card.Header>
                <SectionTitle emoji="🎮" label={t('section_game')} />
              </Card.Header>
              <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <RowList>
                  {shown('difficulty') && (
                    <Row key="difficulty" label={t('row_difficulty')} desc={t('row_difficulty_desc')}>
                      <Managed locked={isLocked('difficulty')}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 'min(260px, 100%)' }}>
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
                      </Managed>
                    </Row>
                  )}
                  {shown('turnDuration') && (
                    <Row key="turn" label={t('row_turn_duration')} desc={t('row_turn_duration_desc')}>
                      <Managed locked={isLocked('turnDuration')}>
                        <ChipGroup
                          options={turnOptions}
                          value={settings.turnDuration}
                          onChange={v => update('turnDuration', v)}
                        />
                      </Managed>
                    </Row>
                  )}
                </RowList>
              </Card.Body>
            </Card>
          )}

          {/* ── Affichage ──────────────────────────────────── */}
          {displayRows.length > 0 && (
            <Card>
              <Card.Header>
                <SectionTitle emoji="👁️" label={t('section_display')} />
              </Card.Header>
              <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <RowList>{displayRows}</RowList>
              </Card.Body>
            </Card>
          )}

          {/* ── Comportement ───────────────────────────────── */}
          {behaviorRows.length > 0 && (
            <Card>
              <Card.Header>
                <SectionTitle emoji="⚙️" label={t('section_behavior')} />
              </Card.Header>
              <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <RowList>{behaviorRows}</RowList>
              </Card.Body>
            </Card>
          )}

          {/* ── Notifications push (lot 7) ─────────────────── */}
          {user && <NotificationsCard settings={settings} update={update} />}

          {/* ── Confidentialité : qui voit quoi (lot 8) ────── */}
          {user && <PrivacyCard />}

          {/* ── Compte et confidentialité (lot 7) ──────────── */}
          <AccountCard />

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
