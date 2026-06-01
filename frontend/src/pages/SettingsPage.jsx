// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';

// ── Composants UI internes ────────────────────────────────────────

const Section = ({ title, icon, children }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '2px solid var(--border-primary)',
    borderRadius: '2px',
    overflow: 'hidden',
    boxShadow: '4px 4px 0 var(--shadow-card)',
  }}>
    <div style={{
      background: 'var(--bg-invert)',
      padding: '10px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '1rem',
        fontWeight: 700,
        color: 'var(--text-invert)',
        letterSpacing: '0.02em',
      }}>
        {title}
      </span>
    </div>
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {children}
    </div>
  </div>
);

const Row = ({ label, desc, children }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
  }}>
    <div style={{ flex: 1, minWidth: '160px' }}>
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '0.95rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '2px',
      }}>
        {label}
      </div>
      {desc && (
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          lineHeight: 1.5,
        }}>
          {desc}
        </div>
      )}
    </div>
    <div style={{ flexShrink: 0 }}>
      {children}
    </div>
  </div>
);

const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    style={{
      width: '48px',
      height: '26px',
      borderRadius: '13px',
      border: `2px solid ${value ? 'var(--olive)' : 'var(--border-muted)'}`,
      background: value ? 'var(--olive)' : 'var(--bg-card-alt)',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.2s, border-color 0.2s',
      boxShadow: 'none',
      padding: 0,
    }}
  >
    <div style={{
      position: 'absolute',
      top: '2px',
      left: value ? 'calc(100% - 20px)' : '2px',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: value ? 'var(--text-invert)' : 'var(--text-muted)',
      transition: 'left 0.2s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    }} />
  </button>
);

const ChipGroup = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
    {options.map(opt => (
      <button
        key={opt.value ?? opt.key}
        onClick={() => onChange(opt.value ?? opt.key)}
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.72rem',
          fontWeight: 500,
          letterSpacing: '0.06em',
          padding: '6px 14px',
          borderRadius: '2px',
          border: `2px solid ${(opt.value ?? opt.key) === value ? 'var(--border-primary)' : 'var(--border-muted)'}`,
          background: (opt.value ?? opt.key) === value ? 'var(--bg-invert)' : 'transparent',
          color: (opt.value ?? opt.key) === value ? 'var(--text-invert)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          boxShadow: (opt.value ?? opt.key) === value ? '2px 2px 0 var(--border-gold-dk)' : 'none',
        }}
      >
        {opt.emoji && <span style={{ marginRight: '5px' }}>{opt.emoji}</span>}
        {opt.short ?? opt.label}
      </button>
    ))}
  </div>
);

// ── Page principale ───────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, update, reset, TURN_OPTIONS, DIFFICULTY_META } = useSettings();
  const { preference, setTheme, THEMES } = useTheme();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const diffOptions = Object.entries(DIFFICULTY_META).map(([key, meta]) => ({
    key, ...meta, value: key,
  }));

  const themeOptions = [
    { value: 'light',  emoji: '☀️',  label: 'Clair' },
    { value: 'dark',   emoji: '🌙',  label: 'Sombre' },
    { value: 'system', emoji: '⚙️',  label: 'Système' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-page)',
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ marginBottom: '2rem', borderBottom: '3px solid var(--border-primary)', paddingBottom: '14px' }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '2.2rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.04em',
          }}>
            Paramètres
          </h1>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            margin: '4px 0 0',
          }}>
            Les préférences sont sauvegardées automatiquement
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Apparence ──────────────────────────────────── */}
          <Section title="Apparence" icon="🎨">
            <Row label="Thème" desc="Choisissez entre clair, sombre, ou la préférence de votre système.">
              <ChipGroup
                options={themeOptions}
                value={preference}
                onChange={setTheme}
              />
            </Row>
          </Section>

          {/* ── Jeu ────────────────────────────────────────── */}
          <Section title="Paramètres de jeu" icon="🎲">

            <Row
              label="Difficulté de l'IA"
              desc="Niveau de l'adversaire lors du prochain démarrage."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {diffOptions.map(d => (
                  <button
                    key={d.key}
                    onClick={() => update('difficulty', d.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      border: `2px solid ${d.key === settings.difficulty ? 'var(--border-primary)' : 'var(--border-muted)'}`,
                      borderRadius: '2px',
                      background: d.key === settings.difficulty ? 'var(--bg-invert)' : 'var(--bg-card-alt)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: d.key === settings.difficulty ? '3px 3px 0 var(--shadow-card)' : 'none',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{d.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: d.key === settings.difficulty ? 'var(--text-invert)' : 'var(--text-primary)',
                      }}>
                        {d.label}
                      </div>
                      <div style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '0.62rem',
                        color: d.key === settings.difficulty ? 'var(--text-invert-muted)' : 'var(--text-muted)',
                        letterSpacing: '0.04em',
                        marginTop: '2px',
                      }}>
                        {d.desc}
                      </div>
                    </div>
                    {d.key === settings.difficulty && (
                      <span style={{ color: 'var(--gold)', fontSize: '1rem', flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </Row>

            <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '18px' }} />

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

          </Section>

          {/* ── Affichage ───────────────────────────────────── */}
          <Section title="Affichage" icon="👁️">

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

          </Section>

          {/* ── Comportement ────────────────────────────────── */}
          <Section title="Comportement" icon="⚙️">

            <Row label="Tri automatique du rack" desc="Trier les lettres du rack par ordre alphabétique.">
              <Toggle value={settings.autoSortRack} onChange={v => update('autoSortRack', v)} />
            </Row>

            <Row label="Confirmer avant valider" desc="Demander une confirmation avant de valider un mot.">
              <Toggle value={settings.confirmValidation} onChange={v => update('confirmValidation', v)} />
            </Row>

          </Section>

          {/* ── Réinitialiser ────────────────────────────────── */}
          <div style={{ textAlign: 'right', paddingBottom: '2rem' }}>
            {showResetConfirm ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Confirmer la réinitialisation ?
                </span>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', padding: '7px 14px', border: '2px solid var(--border-muted)', borderRadius: '2px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', boxShadow: 'none' }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => { reset(); setShowResetConfirm(false); }}
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', padding: '7px 14px', border: '2px solid var(--brick)', borderRadius: '2px', background: 'var(--brick)', color: 'var(--bg-page)', cursor: 'pointer', boxShadow: '2px 2px 0 var(--brick)' }}
                >
                  Réinitialiser
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 16px', border: '2px solid var(--border-muted)', borderRadius: '2px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', boxShadow: 'none', transition: 'color 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--brick)'; e.currentTarget.style.borderColor = 'var(--brick)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-muted)'; }}
              >
                Réinitialiser tous les paramètres
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}