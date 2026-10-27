// src/components/TurnTimer.jsx
import React from 'react';
import { useLanguage } from '../context/LanguageContext';

/**
 * TurnTimer — barre de progression + compte à rebours (affichage seul).
 * Le décompte, la pause et la reprise sont tenus par useGameLogic.
 *
 * Props:
 *   duration  (s)  — durée totale du tour. 0 = illimité (ne s'affiche pas)
 *   remaining (s)  — secondes restantes
 *   paused    bool — minuteur arrêté (bouton Pause)
 */
export default function TurnTimer({ duration, remaining, paused = false }) {
  const { t } = useLanguage();

  // Ne rien afficher si illimité
  if (duration === 0) return null;

  const pct       = (remaining / duration) * 100;
  const mins      = Math.floor(remaining / 60);
  const secs      = remaining % 60;
  const timeStr   = `${mins}:${String(secs).padStart(2, '0')}`;
  const isWarning = pct <= 33;
  const isDanger  = pct <= 15;

  const barColor = isDanger
    ? 'var(--brick)'
    : isWarning
    ? 'var(--tobacco)'
    : 'var(--olive)';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      {/* Temps restant */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          {paused ? t('timer_paused') : t('timer_remaining')}
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '1.1rem',
          fontWeight: 500,
          color: isDanger ? 'var(--brick)' : isWarning ? 'var(--tobacco)' : 'var(--text-primary)',
          letterSpacing: '-0.02em',
          transition: 'color 0.3s',
          animation: isDanger && !paused ? 'pulseGold 0.8s ease-in-out infinite' : 'none',
        }}>
          {timeStr}
        </span>
      </div>

      {/* Barre de progression */}
      <div style={{
        height: '6px',
        background: 'var(--bg-card-alt)',
        borderRadius: '3px',
        overflow: 'hidden',
        border: '1px solid var(--border-muted)',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: '3px',
          transition: 'width 1s linear, background 0.3s ease',
          boxShadow: isDanger ? `0 0 8px var(--brick)` : 'none',
        }} />
      </div>
    </div>
  );
}