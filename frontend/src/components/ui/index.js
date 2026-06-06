// src/components/ui/index.js
//
// Bibliothèque de composants UI partagés.
// Tous s'appuient sur les variables CSS de index.css.
//
// Exports :
//   RetroButton  — bouton rétro avec variantes et effet hover
//   Card         — conteneur carte avec ombre décalée (+ Card.Header, Card.Body)
//   PageHeader   — en-tête de page standardisé
//   MonoLabel    — étiquette DM Mono tout-caps
//   Spinner      — indicateur de chargement circulaire
//   Badge        — pastille colorée (gold | olive | brick | muted | blue)
//   Divider      — séparateur horizontal
//   Input        — champ de saisie avec label et gestion d'erreur

import React from 'react';

export { default as RetroButton } from './RetroButton';

// ── Card ──────────────────────────────────────────────────────────
/**
 * Conteneur rétro à ombre décalée.
 *
 * Props :
 *   size  'sm' (défaut) = bordure 2px + ombre 4px
 *         'lg'          = bordure 3px + ombre 8px
 *   gold  true          = bordure et ombre dorées
 */
function CardHeader({ children, style = {}, ...props }) {
  return (
    <div
      style={{
        background: 'var(--bg-invert)',
        color:      'var(--text-invert)',
        padding:    '10px 18px',
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function CardBody({ children, style = {}, ...props }) {
  return (
    <div style={{ padding: '16px 20px', ...style }} {...props}>
      {children}
    </div>
  );
}

export function Card({ children, size = 'sm', gold = false, style = {}, ...props }) {
  const borderWidth  = size === 'lg' ? '3px' : '2px';
  const shadowOffset = size === 'lg' ? '8px' : '4px';
  const borderColor  = gold ? 'var(--gold)'       : 'var(--border-primary)';
  const shadowColor  = gold ? 'var(--gold)'       : 'var(--shadow-card)';

  return (
    <div
      style={{
        background:   'var(--bg-card)',
        border:       `${borderWidth} solid ${borderColor}`,
        borderRadius: size === 'lg' ? '3px' : '2px',
        boxShadow:    `${shadowOffset} ${shadowOffset} 0 ${shadowColor}`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Sous-composants attachés après la déclaration de Card
Card.Header = CardHeader;
Card.Body   = CardBody;

// ── PageHeader ────────────────────────────────────────────────────
/**
 * En-tête de page standardisé : titre Playfair + sous-titre Mono + séparateur.
 *
 * Props :
 *   title     string   — titre principal (obligatoire)
 *   subtitle  string   — sous-titre DM Mono (optionnel)
 *   children           — contenu additionnel sous le sous-titre (ex : badge de sync)
 */
export function PageHeader({ title, subtitle, children, style = {} }) {
  return (
    <div
      style={{
        borderBottom:  '3px solid var(--border-primary)',
        paddingBottom: '14px',
        marginBottom:  '2rem',
        ...style,
      }}
    >
      <h1
        style={{
          fontFamily:    "'Playfair Display', serif",
          fontSize:      '2.2rem',
          fontWeight:    900,
          letterSpacing: '-0.04em',
          color:         'var(--text-primary)',
          margin:        0,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.7rem',
            letterSpacing: '0.1em',
            color:         'var(--text-muted)',
            margin:        '4px 0 0',
          }}
        >
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

// ── MonoLabel ─────────────────────────────────────────────────────
/**
 * Étiquette DM Mono tout-caps — le pattern typographique le plus répété.
 *
 * Props :
 *   size   'xs' (défaut) | 'sm' | 'md'
 *   color  couleur CSS (défaut : var(--text-muted))
 */
export function MonoLabel({
  children,
  size  = 'xs',
  color = 'var(--text-muted)',
  style = {},
  ...props
}) {
  const sizes = { xs: '0.62rem', sm: '0.72rem', md: '0.82rem' };
  return (
    <span
      style={{
        fontFamily:    "'DM Mono', monospace",
        fontSize:      sizes[size] ?? sizes.xs,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────
/**
 * Indicateur de chargement circulaire.
 * Requiert l'animation @keyframes spin définie dans index.css.
 *
 * Props :
 *   size   px (défaut : 10)
 *   color  couleur CSS (défaut : var(--gold))
 */
export function Spinner({ size = 10, color = 'var(--gold)', style = {} }) {
  return (
    <div
      style={{
        width:          `${size}px`,
        height:         `${size}px`,
        border:         `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius:   '50%',
        animation:      'spin 0.8s linear infinite',
        flexShrink:     0,
        ...style,
      }}
    />
  );
}

// ── Badge ─────────────────────────────────────────────────────────
/**
 * Pastille colorée inline.
 *
 * Props :
 *   variant  'gold' | 'olive' | 'brick' | 'muted' (défaut) | 'blue'
 */
const BADGE_COLORS = {
  gold:  { color: 'var(--gold)',        border: 'var(--gold)'         },
  olive: { color: 'var(--olive)',       border: 'var(--olive)'        },
  brick: { color: 'var(--brick)',       border: 'var(--brick)'        },
  muted: { color: 'var(--text-muted)', border: 'var(--border-muted)' },
  blue:  { color: 'var(--blue-lt)',    border: 'var(--blue)'         },
};

export function Badge({ children, variant = 'muted', style = {}, ...props }) {
  const c = BADGE_COLORS[variant] ?? BADGE_COLORS.muted;
  return (
    <span
      style={{
        fontFamily:    "'DM Mono', monospace",
        fontSize:      '0.58rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        border:        `1px solid ${c.border}`,
        borderRadius:  '2px',
        padding:       '1px 5px',
        display:       'inline-block',
        color:         c.color,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

// ── Divider ───────────────────────────────────────────────────────
/**
 * Séparateur horizontal.
 *
 * Props :
 *   heavy  true = bordure 3px encre | false (défaut) = 1px muted
 */
export function Divider({ heavy = false, style = {} }) {
  return (
    <hr
      style={{
        border:    'none',
        borderTop: heavy
          ? '3px solid var(--border-primary)'
          : '1px solid var(--border-muted)',
        margin: 0,
        ...style,
      }}
    />
  );
}

// ── Input ─────────────────────────────────────────────────────────
/**
 * Champ de saisie stylisé cohérent avec le design system.
 * Accepte tous les props HTML natifs d'un <input>.
 *
 * Props supplémentaires :
 *   label  string  — affiché au-dessus du champ
 *   error  string  — message d'erreur affiché en bas + bordure brick
 */
export function Input({ label, error, id, style = {}, ...props }) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  const handleFocus = (e) => {
    e.currentTarget.style.borderColor = 'var(--gold)';
    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(200,168,48,0.15)';
  };

  const handleBlur = (e) => {
    e.currentTarget.style.borderColor = error ? 'var(--brick)' : 'var(--border-primary)';
    e.currentTarget.style.boxShadow   = 'none';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.62rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--text-muted)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          width:         '100%',
          background:    'var(--bg-input)',
          color:         'var(--text-primary)',
          border:        `2px solid ${error ? 'var(--brick)' : 'var(--border-primary)'}`,
          borderRadius:  '2px',
          padding:       '10px 14px',
          fontFamily:    "'Libre Baskerville', serif",
          fontSize:      '0.95rem',
          outline:       'none',
          boxSizing:     'border-box',
          transition:    'border-color 0.15s, box-shadow 0.15s',
          ...style,
        }}
        {...props}
      />
      {error && (
        <span
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.62rem',
            letterSpacing: '0.06em',
            color:         'var(--brick)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}