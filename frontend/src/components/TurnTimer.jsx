// src/components/TurnTimer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

/**
 * TurnTimer — barre de progression + compte à rebours.
 *
 * Props:
 *   duration      (s)  — durée totale du tour. 0 = illimité (ne s'affiche pas)
 *   isActive      bool — le timer tourne quand true
 *   onExpire      fn   — appelé quand le temps est écoulé
 *   onReset       ref  — exposé pour reset externe (resetTimer())
 */
export default function TurnTimer({ duration, isActive, onExpire, resetRef }) {
  const [remaining, setRemaining] = useState(duration);
  const firedRef = useRef(false);   // onExpire déjà appelé pour ce tour ?
  const { t } = useLanguage();

  // Nouvelle durée (réglage modifié) : on repart du début. Ajuster l'état
  // pendant le rendu évite un rendu supplémentaire avec l'ancienne valeur.
  const [prevDuration, setPrevDuration] = useState(duration);
  if (duration !== prevDuration) {
    setPrevDuration(duration);
    setRemaining(duration);
  }

  // Exposer resetTimer via ref (appelé par le parent à chaque nouveau tour)
  useEffect(() => {
    if (resetRef) {
      resetRef.current = () => setRemaining(duration);
    }
  }, [resetRef, duration]);

  // Tick : une seconde de moins tant que le minuteur tourne
  const running = isActive && duration > 0 && remaining > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Temps écoulé : prévenir le parent une seule fois par tour
  useEffect(() => {
    if (remaining > 0) {
      firedRef.current = false;
      return;
    }
    if (duration > 0 && isActive && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, duration, isActive, onExpire]);

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
          {t('timer_remaining')}
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '1.1rem',
          fontWeight: 500,
          color: isDanger ? 'var(--brick)' : isWarning ? 'var(--tobacco)' : 'var(--text-primary)',
          letterSpacing: '-0.02em',
          transition: 'color 0.3s',
          animation: isDanger ? 'pulseGold 0.8s ease-in-out infinite' : 'none',
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