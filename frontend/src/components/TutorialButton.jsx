import React, { useState } from 'react';
import { useTutorialContext } from '../context/TutorialContext';

export default function TutorialButton({ t }) {
  const { openTutorial } = useTutorialContext();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={openTutorial}
      title={t('tuto_open_btn_title')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position:       'fixed',
        bottom:         '28px',
        right:          '28px',
        zIndex:         9999,
        width:          '44px',
        height:         '44px',
        borderRadius:   '50%',
        background:     hovered ? 'var(--text-primary)' : 'var(--bg-card)',
        border:         '2.5px solid var(--border-primary)',
        boxShadow:      hovered
          ? '3px 3px 0 var(--border-primary)'
          : '4px 4px 0 var(--border-primary)',
        transform:      hovered ? 'translate(-1px, -1px)' : 'none',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        transition:     'background 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      aria-label={t('tuto_open_btn_title')}
    >
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontSize:   '1.2rem',
        fontWeight: 900,
        color:      hovered ? 'var(--bg-card)' : 'var(--text-primary)',
        lineHeight: 1,
        userSelect: 'none',
        transition: 'color 0.15s',
      }}>
        ?
      </span>

      {hovered && (
        <span style={{
          position:      'absolute',
          right:         '52px',
          fontFamily:    "'DM Mono', monospace",
          fontSize:      '0.62rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         'var(--text-primary)',
          background:    'var(--bg-card)',
          border:        '1.5px solid var(--border-muted)',
          borderRadius:  '2px',
          padding:       '4px 10px',
          whiteSpace:    'nowrap',
          boxShadow:     '2px 2px 0 var(--border-muted)',
          pointerEvents: 'none',
        }}>
          {t('tuto_open_btn_title')}
        </span>
      )}
    </button>
  );
}