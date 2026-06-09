// src/components/TutorialOverlay.jsx  (v3 — accessibilité ARIA complète)
// Remplace entièrement la v2.
//
// Améliorations vs v2 :
//   - Focus trap réel (Tab / Shift+Tab confinés dans la bulle)
//   - aria-live="polite" sur le corps → les lecteurs d'écran annoncent le changement d'étape
//   - aria-describedby sur la bulle → description complète accessible
//   - role="dialog" + aria-modal="true" + aria-labelledby
//   - Indicateurs de progression accessibles (aria-valuenow/valuemin/valuemax)
//   - Boutons avec aria-label explicites
//   - Gestion propre du focus retour à l'élément déclencheur à la fermeture

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import { useTutorialContext } from '../context/TutorialContext';

// ── Étapes ───────────────────────────────────────────────────────

const buildSteps = (t) => [
  { target: null,           position: 'center', icon: '🎩', title: t('tuto_step0_title'), body: t('tuto_step0_body'), hint: null },
  { target: 'board',        position: 'right',  icon: '🗂️', title: t('tuto_step1_title'), body: t('tuto_step1_body'), hint: null },
  { target: 'board-center', position: 'right',  icon: '⭐', title: t('tuto_step2_title'), body: t('tuto_step2_body'), hint: null },
  { target: 'board-legend', position: 'top',    icon: '🎯', title: t('tuto_step3_title'), body: t('tuto_step3_body'), hint: null },
  { target: 'tile-rack',    position: 'top',    icon: '🔤', title: t('tuto_step4_title'), body: t('tuto_step4_body'), hint: t('tuto_step4_hint') },
  { target: 'score-preview',position: 'left',   icon: '🔢', title: t('tuto_step5_title'), body: t('tuto_step5_body'), hint: null },
  { target: 'btn-validate', position: 'left',   icon: '✅', title: t('tuto_step6_title'), body: t('tuto_step6_body'), hint: t('tuto_step6_hint') },
  { target: 'btn-pass',     position: 'left',   icon: '⏭️', title: t('tuto_step7_title'), body: t('tuto_step7_body'), hint: null },
  { target: 'score-panel',  position: 'left',   icon: '🏆', title: t('tuto_step8_title'), body: t('tuto_step8_body'), hint: null },
];

// ── Constantes ────────────────────────────────────────────────────

const PAD      = 16;
const BUBBLE_W = 320;

// Sélecteur de tous les éléments focusables dans un conteneur
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ── Helpers ───────────────────────────────────────────────────────

function getViewportRect(ref) {
  if (!ref?.current) return null;
  return ref.current.getBoundingClientRect();
}

function getBubbleStyle(vRect, position) {
  if (!vRect || position === 'center') {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: `${BUBBLE_W}px`, zIndex: 10001 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top, left;
  switch (position) {
    case 'right':  top = vRect.top + vRect.height / 2 - 120; left = vRect.right + PAD; break;
    case 'left':   top = vRect.top + vRect.height / 2 - 120; left = vRect.left - BUBBLE_W - PAD; break;
    case 'top':    top = vRect.top - PAD - 240; left = vRect.left + vRect.width / 2 - BUBBLE_W / 2; break;
    default:       top = vRect.bottom + PAD;    left = vRect.left + vRect.width / 2 - BUBBLE_W / 2;
  }
  left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12));
  top  = Math.max(12, Math.min(top,  vh - 300));
  return { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${BUBBLE_W}px`, zIndex: 10001 };
}

// ── Composant ─────────────────────────────────────────────────────

export default function TutorialOverlay({ t }) {
  const {
    isOpen, step, nextStep, prevStep, closeTutorial,
    getRef, stepConditions,
  } = useTutorialContext();

  const steps        = useMemo(() => buildSteps(t), [t]);
  const total        = steps.length;
  const current      = steps[step] ?? steps[0];
  const isConditional = Boolean(stepConditions[step]);

  const [vRect, setVRect]           = useState(null);
  const [bubbleStyle, setBubbleStyle] = useState({});
  const [visible, setVisible]       = useState(false);

  // Refs accessibilité
  const dialogRef       = useRef(null);
  const triggerRef      = useRef(null); // mémorise l'élément qui avait le focus avant l'ouverture
  const titleId         = useRef(`tuto-title-${Math.random().toString(36).slice(2)}`).current;
  const descId          = useRef(`tuto-desc-${Math.random().toString(36).slice(2)}`).current;
  const liveRegionRef   = useRef(null);

  // ResizeObserver
  const roRef = useRef(null);

  const recalc = useCallback(() => {
    const ref  = current.target ? getRef(current.target) : null;
    const rect = getViewportRect(ref);
    setVRect(rect);
    setBubbleStyle(getBubbleStyle(rect, current.position));
  }, [current, getRef]);

  // ResizeObserver sur la cible courante
  useEffect(() => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!isOpen || !current.target) return;
    const el = getRef(current.target)?.current;
    if (!el) return;
    roRef.current = new ResizeObserver(recalc);
    roRef.current.observe(el);
    return () => { roRef.current?.disconnect(); roRef.current = null; };
  }, [isOpen, current.target, getRef, recalc]);

  // Ouverture / changement d'étape
  useEffect(() => {
    if (!isOpen) { setVisible(false); return; }

    // Mémoriser l'élément focusé avant l'ouverture (pour le restaurer à la fermeture)
    if (!triggerRef.current) {
      triggerRef.current = document.activeElement;
    }

    recalc();

    if (current.target) {
      const el = getRef(current.target)?.current;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const timer = setTimeout(() => {
      setVisible(true);
      // Donner le focus à la bulle
      dialogRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, step, recalc, current.target, getRef]);

  // Restaurer le focus à la fermeture
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current?.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Window resize
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [isOpen, recalc]);

  // ── Focus trap ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!dialogRef.current) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeTutorial();
      return;
    }

    if (e.key === 'ArrowRight' && !isConditional) {
      e.preventDefault();
      nextStep(total);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevStep();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (focusables.length === 0) { e.preventDefault(); return; }

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [closeTutorial, nextStep, prevStep, total, isConditional]);

  if (!isOpen) return null;

  // ── Spotlight SVG ─────────────────────────────────────────────
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spotlightPath = (() => {
    if (!vRect || !current.target) return `M0,0 H${vw} V${vh} H0 Z`;
    const r = 6;
    const T = Math.max(0, vRect.top    - PAD);
    const L = Math.max(0, vRect.left   - PAD);
    const B = Math.min(vh, vRect.bottom + PAD);
    const R = Math.min(vw, vRect.right  + PAD);
    return [
      `M0,0 H${vw} V${vh} H0 Z`,
      `M${L+r},${T} H${R-r} Q${R},${T} ${R},${T+r}`,
      `V${B-r} Q${R},${B} ${R-r},${B}`,
      `H${L+r} Q${L},${B} ${L},${B-r}`,
      `V${T+r} Q${L},${T} ${L+r},${T} Z`,
    ].join(' ');
  })();

  const progress = ((step + 1) / total) * 100;

  return (
    <>
      {/* ── Fond SVG ──────────────────────────────────────── */}
      <svg
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        width={vw} height={vh}
        viewBox={`0 0 ${vw} ${vh}`}
        aria-hidden="true"
        focusable="false"
      >
        <path d={spotlightPath} fill="rgba(15,12,8,0.78)" fillRule="evenodd" />
        {vRect && current.target && (
          <rect
            x={Math.max(0, vRect.left - PAD)} y={Math.max(0, vRect.top - PAD)}
            width={vRect.width + PAD * 2} height={vRect.height + PAD * 2}
            rx={6} fill="none"
            stroke="var(--gold, #C8A830)" strokeWidth="2.5" strokeDasharray="8 4"
            style={{ animation: 'tutoDash 1.2s linear infinite' }}
          />
        )}
      </svg>

      {/* ── Live region pour les annonces aux lecteurs d'écran ── */}
      {/* Séparé de la bulle pour éviter que le focus trap ne perturbe les annonces */}
      <div
        ref={liveRegionRef}
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {visible ? `${t('tuto_step_label')} ${step + 1} ${t('tuto_step_of')} ${total} : ${current.title}. ${current.body}` : ''}
      </div>

      {/* ── Bulle de dialogue ─────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          ...bubbleStyle,
          opacity:    visible ? 1 : 0,
          transform:  [bubbleStyle.transform ?? '', `translateY(${visible ? 0 : 12}px)`].filter(Boolean).join(' '),
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          background: 'var(--bg-card, #FAF3E0)',
          border:     '3px solid var(--border-primary, #1E1A12)',
          borderRadius: '4px',
          boxShadow:  '6px 6px 0 var(--border-primary, #1E1A12)',
          padding:    '24px',
          outline:    'none',
        }}
      >
        {/* Barre de progression — avec attributs ARIA */}
        <div
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`${t('tuto_progress_label')}: ${step + 1} / ${total}`}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--border-muted)', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}
        >
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold, #C8A830)', transition: 'width 0.4s ease' }} />
        </div>

        {/* Compteur visible + badge conditionnel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }} aria-hidden="true">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {step + 1} / {total}
          </span>
          {isConditional && (
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--olive, #4A5E2A)',
              background: 'rgba(74,94,42,0.12)', border: '1px solid var(--olive)', borderRadius: '2px',
              padding: '2px 8px', animation: 'tutoPulse 1.8s ease-in-out infinite',
            }}>
              {t('tuto_action_required')}
            </span>
          )}
        </div>

        {/* Titre — référencé par aria-labelledby */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0 }} aria-hidden="true">
            {current.icon}
          </span>
          <h3
            id={titleId}
            style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}
          >
            {current.title}
          </h3>
        </div>

        {/* Corps — référencé par aria-describedby */}
        <p
          id={descId}
          style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}
        >
          {current.body}
        </p>

        {/* Hint conditionnel */}
        {current.hint && (
          <div
            role="note"
            aria-label={t('tuto_hint_label')}
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: '0.72rem',
              color: 'var(--olive, #4A5E2A)', background: 'rgba(74,94,42,0.08)',
              border: '1.5px dashed var(--olive)', borderRadius: '2px',
              padding: '8px 12px', marginBottom: '16px', lineHeight: 1.5,
            }}
          >
            👆 {current.hint}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>

          {/* Passer */}
          <button
            onClick={closeTutorial}
            aria-label={t('tuto_skip_aria')}
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '4px 0', marginRight: 'auto', textDecoration: 'underline',
            }}
          >
            {t('tuto_skip')}
          </button>

          {/* Précédent */}
          {step > 0 && (
            <button
              onClick={prevStep}
              aria-label={t('tuto_prev_aria', { step: step })}
              style={{
                fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)',
                background: 'transparent', border: '2px solid var(--border-primary)',
                borderRadius: '2px', cursor: 'pointer', padding: '8px 14px',
                boxShadow: '3px 3px 0 var(--border-primary)',
              }}
            >
              ← {t('tuto_prev')}
            </button>
          )}

          {/* Suivant / Terminer */}
          {!isConditional && (
            <button
              onClick={() => step >= total - 1 ? closeTutorial() : nextStep(total)}
              aria-label={step >= total - 1 ? t('tuto_finish_aria') : t('tuto_next_aria', { step: step + 2, total })}
              style={{
                fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-invert, #FAF3E0)', background: 'var(--olive, #4A5E2A)',
                border: '2px solid var(--olive-dk, #3D4A20)', borderRadius: '2px',
                cursor: 'pointer', padding: '8px 16px',
                boxShadow: '3px 3px 0 var(--olive-dk, #3D4A20)',
              }}
            >
              {step >= total - 1 ? `${t('tuto_finish')} ✓` : `${t('tuto_next')} →`}
            </button>
          )}

          {/* Message d'attente pour étape conditionnelle */}
          {isConditional && (
            <span
              aria-live="off"
              style={{
                fontFamily: "'DM Mono', monospace", fontSize: '0.65rem',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)', fontStyle: 'italic',
              }}
            >
              {t('tuto_waiting')}
            </span>
          )}
        </div>
      </div>

      {/* ── Keyframes ─────────────────────────────────────── */}
      <style>{`
        @keyframes tutoDash  { to { stroke-dashoffset: -24; } }
        @keyframes tutoPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}