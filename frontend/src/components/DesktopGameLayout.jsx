// src/components/DesktopGameLayout.jsx
//
// Écran de jeu ordinateur / tablette, partagé par le solo et le multijoueur.
// Mise en page plein écran sans défilement : styles/desktop.css.

import React from 'react';

// ── DesktopGameLayout ─────────────────────────────────────────────
// Conteneur de l'écran de jeu ordinateur / tablette : la page ne défile
// plus pendant la partie (classe retirée en quittant l'écran).

export default function DesktopGameLayout({ children }) {
  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.add('dg-lock');
    return () => html.classList.remove('dg-lock');
  }, []);
  return <div className="dg">{children}</div>;
}

// ── Legend ────────────────────────────────────────────────────────

export function Legend({ t }) {
  const items = [
    { label: 'TM', color: '#8B2020', key: 'legend_tw' },
    { label: 'DM', color: '#C8803A', key: 'legend_dw' },
    { label: 'TL', color: '#1A4A8A', key: 'legend_tl' },
    { label: 'DL', color: '#3A7EB8', key: 'legend_dl' },
  ];
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {items.map(({ label, color, key }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '22px', height: '22px', background: color, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center',}}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em',}}>
              {label}
            </span>
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)',}}>
            {t(key)}
          </span>
        </div>
      ))}
    </div>
  );
}
