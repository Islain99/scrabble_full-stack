// src/components/settings/SettingsParts.jsx
// Briques de la page Paramètres (ligne, interrupteur, titre de section),
// partagées avec les cartes Notifications et Compte (lot 7).
import React from 'react';
import { MonoLabel } from '../ui';

/** Ligne label + description + contrôle à droite */
export const Row = ({ label, desc, children }) => (
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
    {/* Le contrôle peut rétrécir et passer à la ligne (téléphone) au lieu de déborder */}
    <div className="s-row-control" style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}>{children}</div>
  </div>
);

/** Toggle switch animé */
export const Toggle = ({ value, onChange, label, disabled = false }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    aria-pressed={value}
    aria-label={label}
    disabled={disabled}
    style={{
      width:        '48px',
      height:       '26px',
      borderRadius: '13px',
      border:       `2px solid ${value ? 'var(--olive)' : 'var(--border-muted)'}`,
      background:   value ? 'var(--olive)' : 'var(--bg-card-alt)',
      position:     'relative',
      cursor:       disabled ? 'not-allowed' : 'pointer',
      opacity:      disabled ? 0.5 : 1,
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

// ── Titre de section ──────────────────────────────────────────────

export const SectionTitle = ({ emoji, label }) => (
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
