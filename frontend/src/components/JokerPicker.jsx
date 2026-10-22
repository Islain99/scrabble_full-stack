// src/components/JokerPicker.jsx
//
// Fenêtre de choix de la lettre représentée par un joker (★).
// Affichée quand le joueur pose un joker sur le plateau.

import React, { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function JokerPicker({ open, onPick, onCancel }) {
  const { t } = useLanguage();

  // Clavier : une lettre la choisit, Échap annule
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { onCancel(); return; }
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= 'A' && k <= 'Z') onPick(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPick, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="joker-picker-title"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '3px solid var(--border-primary)',
          boxShadow: '6px 6px 0 var(--border-primary)',
          borderRadius: '6px',
          padding: '20px',
          width: '100%', maxWidth: '360px',
          display: 'flex', flexDirection: 'column', gap: '14px',
        }}
      >
        <div
          id="joker-picker-title"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '1.2rem', fontWeight: 700,
            color: 'var(--text-primary)', textAlign: 'center',
          }}
        >
          ★ {t('joker_pick_title')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {LETTERS.map(letter => (
            <button
              key={letter}
              type="button"
              onClick={() => onPick(letter)}
              aria-label={letter}
              style={{
                aspectRatio: '1 / 1',
                minHeight: '36px',
                background: 'var(--tile-joker-bg)',
                border: '2px solid var(--tile-joker-border)',
                boxShadow: '2px 2px 0 var(--tile-shadow)',
                borderRadius: '3px',
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '1.1rem', fontWeight: 700,
                color: 'var(--tile-text)',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {letter}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          style={{
            alignSelf: 'center',
            background: 'none', border: 'none',
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer',
            padding: '6px 10px',
          }}
        >
          {t('btn_cancel')}
        </button>
      </div>
    </div>
  );
}
