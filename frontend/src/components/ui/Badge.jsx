import React from 'react';

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

export default Badge;