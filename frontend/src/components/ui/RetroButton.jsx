// src/components/ui/RetroButton.jsx
// Bouton réutilisable — extrait de App.jsx.
// Usage :
//   <RetroButton variant="primary" onClick={fn}>Valider</RetroButton>
//   <RetroButton variant="danger" fullWidth disabled>Abandonner</RetroButton>

import React, { useState } from 'react';

const VARIANTS = {
  default: {
    bg:        'transparent',
    color:     'var(--text-primary)',
    border:    'var(--border-primary)',
    hoverBg:   'var(--text-primary)',
    hoverText: 'var(--bg-page)',
  },
  primary: {
    bg:        'var(--olive)',
    color:     'var(--text-invert)',
    border:    'var(--olive-dk)',
    hoverBg:   'var(--olive-dk)',
    hoverText: 'var(--text-invert)',
  },
  danger: {
    bg:        'transparent',
    color:     'var(--brick)',
    border:    'var(--brick)',
    hoverBg:   'var(--brick)',
    hoverText: 'var(--bg-page)',
  },
  tobacco: {
    bg:        'transparent',
    color:     'var(--tobacco-dk)',
    border:    'var(--tobacco)',
    hoverBg:   'var(--tobacco)',
    hoverText: 'var(--text-invert)',
  },
};

/**
 * @param {{
 *   variant?: 'default' | 'primary' | 'danger' | 'tobacco',
 *   fullWidth?: boolean,
 *   disabled?: boolean,
 *   onClick?: () => void,
 *   children: React.ReactNode,
 *   style?: React.CSSProperties,
 * }} props
 */
export default function RetroButton({
  onClick,
  disabled = false,
  children,
  variant = 'default',
  fullWidth = false,
  style = {},
}) {
  const [hovered, setHovered] = useState(false);
  const v = VARIANTS[variant] ?? VARIANTS.default;

  const baseStyle = {
    width:          fullWidth ? '100%' : 'auto',
    background:     disabled ? 'transparent' : hovered ? v.hoverBg : v.bg,
    color:          disabled ? 'var(--text-muted)' : hovered ? v.hoverText : v.color,
    border:         `2px solid ${disabled ? 'var(--border-muted)' : v.border}`,
    fontFamily:     "'DM Mono', monospace",
    fontSize:       '0.82rem',
    fontWeight:     500,
    letterSpacing:  '0.08em',
    textTransform:  'uppercase',
    padding:        '11px 18px',
    borderRadius:   '2px',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    transition:     'background 0.12s, color 0.12s',
    boxShadow:      disabled
      ? 'none'
      : hovered
        ? `3px 3px 0 ${v.border}`
        : `4px 4px 0 ${v.border}`,
    transform:      hovered && !disabled ? 'translate(-1px, -1px)' : 'none',
    ...style,
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={baseStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}