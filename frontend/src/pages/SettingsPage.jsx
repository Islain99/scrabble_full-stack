// src/pages/SettingsPage.jsx
// Refactorisé : composants Section/Row/Toggle/ChipGroup locaux
// → Card, PageHeader, MonoLabel, RetroButton, Spinner du design system ui/

import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useTheme }    from '../context/ThemeContext';
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
        fontFamily:  "'Playfair Display', serif",
        fontSize:    '0.95rem',
        fontWeight:  700,
        color:       'var(--text-primary)',
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

// ── Page principale ───────────────────────────────────────────────

export default function SettingsPage() {
  const {
    settings, update, reset,
    TURN_OPTIONS, DIFFICULTY_META,
    syncing, lastSynced, currentUid,
  } = useSettings();
  const { preference, setTheme } = useTheme();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const diffOptions = Object.entries(DIFFICULTY_META).map(([key, meta]) => ({
    key, ...meta, value: key,
  }));

  const themeOptions = [
    { value: 'light',  emoji: '☀️', label: 'Clair'   },
    { value: 'dark',   emoji: '🌙', label: 'Sombre'  },
    { value: 'system', emoji: '⚙️', label: 'Système' },
  ];

  const syncLabel = syncing
    ? '⟳ Synchronisation…'
    : lastSynced
      ? `✓ Sauvegardé ${lastSynced.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : currentUid
        ? 'Non synchronisé'
        : 'Mode invité — connectez-vous pour synchroniser';

  const SyncBadge = () => (
    <div style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        '6px',
      marginTop:  '8px',
      padding:    '4px 10px',
      background: syncing ? 'var(--bg-card-alt)' : lastSynced ? 'rgba(94,107,58,0.12)' : 'var(--bg-card-alt)',
      border:     `1px solid ${syncing ? 'var(--border-muted)' : lastSynced ? 'var(--olive)' : 'var(--border-muted)'}`,
      borderRadius: '2px',
    }}>
      {syncing && <Spinner size={10} />}
      <MonoLabel color={lastSynced && !syncing ? 'var(--olive)' : 'var(--text-muted)'}>
        {syncLabel}
      </MonoLabel>
    </div>
  );

  return (
    <div className="s-page">
      <div className="s-container">

        <PageHeader
          title="Paramètres"
          subtitle="Les préférences sont sauvegardées automatiquement"
        >
          <SyncBadge />
        </PageHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Apparence ──────────────────────────────────── */}
          <Card>
            <Card.Header>
              <span style={{ fontSize: '1rem' }}>🎨</span>
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1rem', fontWeight: 700,
                color: 'var(--text-invert)',
              }}>
                Apparence
              </span>
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Row label="Thème" desc="Choisissez entre clair, sombre, ou la préférence de votre système.">
                <ChipGroup options={themeOptions} value={preference} onChange={setTheme} />
              </Row>
            </Card.Body>
          </Card>

          {/* ── Partie ─────────────────────────────────────── */}
          <Card>
            <Card.Header>
              <span style={{ fontSize: '1rem' }}>🎮</span>
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1rem', fontWeight: 700,
                color: 'var(--text-invert)',
              }}>
                Partie
              </span>
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <Row label="Difficulté de l'IA" desc="Niveau de l'adversaire IA.">
                {/* Sélecteur de difficulté enrichi (avec desc) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '260px' }}>
                  {diffOptions.map(d => {
                    const active = d.key === settings.difficulty;
                    return (
                      <button
                        key={d.key}
                        onClick={() => update('difficulty', d.key)}
                        style={{
                          display:     'flex',
                          alignItems:  'center',
                          gap:         '10px',
                          padding:     '10px 14px',
                          borderRadius: '2px',
                          border:      `2px solid ${active ? 'var(--border-primary)' : 'var(--border-muted)'}`,
                          background:  active ? 'var(--bg-invert)' : 'transparent',
                          cursor:      'pointer',
                          transition:  'all 0.15s',
                          boxShadow:   active ? '3px 3px 0 var(--border-gold-dk)' : 'none',
                          textAlign:   'left',
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

              <Row
                label="Durée de tour"
                desc="Temps alloué par tour. Quand le temps expire, le tour est passé automatiquement."
              >
                <ChipGroup
                  options={TURN_OPTIONS.map(o => ({ ...o, value: o.value, short: o.label }))}
                  value={settings.turnDuration}
                  onChange={v => update('turnDuration', v)}
                />
              </Row>

            </Card.Body>
          </Card>

          {/* ── Affichage ──────────────────────────────────── */}
          <Card>
            <Card.Header>
              <span style={{ fontSize: '1rem' }}>👁️</span>
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1rem', fontWeight: 700,
                color: 'var(--text-invert)',
              }}>
                Affichage
              </span>
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Row label="Score provisoire" desc="Afficher le score estimé pendant le placement des tuiles.">
                <Toggle value={settings.showScorePreview} onChange={v => update('showScorePreview', v)} />
              </Row>
              <Row label="Tuiles restantes" desc="Afficher le nombre de tuiles restantes dans le sac.">
                <Toggle value={settings.showRemainingTiles} onChange={v => update('showRemainingTiles', v)} />
              </Row>
              <Row label="Labels des cases bonus" desc="Afficher 2M, 3L, etc. sur les cases spéciales du plateau.">
                <Toggle value={settings.showBonusLabels} onChange={v => update('showBonusLabels', v)} />
              </Row>
              <Row label="Animations" desc="Transitions et effets visuels.">
                <Toggle value={settings.animationsEnabled} onChange={v => update('animationsEnabled', v)} />
              </Row>
            </Card.Body>
          </Card>

          {/* ── Comportement ───────────────────────────────── */}
          <Card>
            <Card.Header>
              <span style={{ fontSize: '1rem' }}>⚙️</span>
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1rem', fontWeight: 700,
                color: 'var(--text-invert)',
              }}>
                Comportement
              </span>
            </Card.Header>
            <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Row label="Tri automatique du rack" desc="Trier les lettres du rack par ordre alphabétique.">
                <Toggle value={settings.autoSortRack} onChange={v => update('autoSortRack', v)} />
              </Row>
              <Row label="Confirmer avant valider" desc="Demander une confirmation avant de valider un mot.">
                <Toggle value={settings.confirmValidation} onChange={v => update('confirmValidation', v)} />
              </Row>
            </Card.Body>
          </Card>

          {/* ── Réinitialiser ──────────────────────────────── */}
          <div style={{ textAlign: 'right', paddingBottom: '2rem' }}>
            {showResetConfirm ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                <MonoLabel>Confirmer la réinitialisation ?</MonoLabel>
                <RetroButton variant="default" onClick={() => setShowResetConfirm(false)}>
                  Annuler
                </RetroButton>
                <RetroButton variant="danger" onClick={() => { reset(); setShowResetConfirm(false); }}>
                  Réinitialiser
                </RetroButton>
              </div>
            ) : (
              <RetroButton variant="default" onClick={() => setShowResetConfirm(true)}>
                Réinitialiser tous les paramètres
              </RetroButton>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}