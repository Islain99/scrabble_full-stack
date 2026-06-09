// src/components/TutorialOverlay.jsx  (v4 — Animations SVG intro + ResizeObserver)
// Remplace entièrement la v3.
//
// Nouveautés vs v3 :
//   A) ANIMATION SVG INTRO (étape 0 uniquement)
//      - Mini-démo SVG animée en CSS pur intégrée dans la bulle
//      - Illustre : tuile qui glisse du rack → plateau → score
//      - Zéro dépendance externe, ~150 lignes SVG/CSS
//
//   B) RESIZEOBSERVER MULTI-CIBLES + THROTTLE
//      - Observer attaché à la cible courante ET à document.body
//        (capte les layout shifts globaux : sidebar qui s'ouvre, etc.)
//      - Recalcul throttlé à 100ms via requestAnimationFrame
//        pour éviter les recalculs excessifs sur les animations fluides

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import { useTutorialContext } from '../context/TutorialContext';

// ════════════════════════════════════════════════════════════════
// A. ANIMATION SVG INTRO
// ════════════════════════════════════════════════════════════════

// Couleurs issues des CSS vars — on utilise des valeurs de fallback
// cohérentes avec le thème existant.

function IntroAnimation() {
  return (
    <div style={{ margin: '0 0 18px', userSelect: 'none' }} aria-hidden="true">
      <svg
        viewBox="0 0 280 130"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* ── Fond plateau (grille 3×3 simplifiée) ── */}
        <rect x="96" y="10" width="90" height="90" rx="3" fill="#E8DFC8" stroke="#C8B89A" strokeWidth="1" />
        {/* Cellules */}
        {[0,1,2].map(r => [0,1,2].map(c => (
          <rect
            key={`${r}-${c}`}
            x={97 + c * 30} y={11 + r * 30}
            width="29" height="29"
            rx="1"
            fill={r === 1 && c === 1 ? '#C8A830' : '#F0E8D0'}
            fillOpacity={r === 1 && c === 1 ? 0.3 : 1}
            stroke="#C8B89A" strokeWidth="0.5"
          />
        )))}
        {/* Étoile case centrale */}
        <text x="141" y="31" textAnchor="middle" fontSize="10" fill="#C8A830">★</text>

        {/* ── Rack (bas) ── */}
        <rect x="96" y="112" width="90" height="16" rx="2" fill="#D4C4A0" stroke="#C8B89A" strokeWidth="1" />
        <rect x="99" y="114" width="12" height="12" rx="1" fill="#F5E6C8" stroke="#8B6914" strokeWidth="1" />
        <text x="105" y="124" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E1A12">S</text>
        <rect x="113" y="114" width="12" height="12" rx="1" fill="#F5E6C8" stroke="#8B6914" strokeWidth="1" />
        <text x="119" y="124" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E1A12">C</text>
        <rect x="127" y="114" width="12" height="12" rx="1" fill="#F5E6C8" stroke="#8B6914" strokeWidth="1" />
        <text x="133" y="124" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E1A12">O</text>
        {/* autres tuiles grisées */}
        {[141, 155, 169].map((x, i) => (
          <rect key={i} x={x} y="114" width="12" height="12" rx="1" fill="#E8D8B0" stroke="#C8B89A" strokeWidth="0.8" opacity="0.6" />
        ))}

        {/* ── Tuile animée (S → case centrale) ── */}
        {/* animate: glisse de (105,118) vers (126,26) puis fade out, score apparaît */}
        <g>
          <rect
            x="99" y="114" width="12" height="12" rx="1"
            fill="#F5E6C8" stroke="#8B6914" strokeWidth="1.5"
            style={{
              animation: 'tutoTileSlide 2.4s ease-in-out infinite',
              transformOrigin: '105px 120px',
            }}
          />
          <text
            x="105" y="124"
            textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E1A12"
            style={{ animation: 'tutoTileSlide 2.4s ease-in-out infinite' }}
          >S</text>
        </g>

        {/* ── Tuile posée sur le plateau (apparaît pendant l'animation) ── */}
        <g style={{ animation: 'tutoTileLand 2.4s ease-in-out infinite' }}>
          <rect x="126" y="26" width="12" height="12" rx="1" fill="#F5E6C8" stroke="#8B6914" strokeWidth="1.5" />
          <text x="132" y="36" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E1A12">S</text>
        </g>

        {/* ── Score preview (apparaît à droite du plateau) ── */}
        <g style={{ animation: 'tutoScorePop 2.4s ease-in-out infinite' }}>
          <rect x="194" y="34" width="36" height="20" rx="2" fill="#FAF3E0" stroke="#C8A830" strokeWidth="1.5" />
          <text x="212" y="48" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#C8A830">+1</text>
        </g>

        {/* ── Labels ── */}
        <text x="141" y="108" textAnchor="middle" fontSize="7" fill="#8B7B5A" fontFamily="monospace">Plateau</text>
        <text x="141" y="136" textAnchor="middle" fontSize="7" fill="#8B7B5A" fontFamily="monospace">Chevalet</text>
        <text x="212" y="62" textAnchor="middle" fontSize="6" fill="#8B7B5A" fontFamily="monospace">score</text>

        {/* ── Flèche animée rack → plateau ── */}
        <line
          x1="105" y1="113" x2="130" y2="42"
          stroke="#C8A830" strokeWidth="1" strokeDasharray="3 2"
          style={{ animation: 'tutoArrow 2.4s ease-in-out infinite' }}
        />
        <polygon
          points="128,37 133,45 123,45"
          fill="#C8A830"
          style={{ animation: 'tutoArrow 2.4s ease-in-out infinite' }}
        />
      </svg>

      {/* ── Keyframes inline pour l'animation intro ── */}
      <style>{`
        @keyframes tutoTileSlide {
          0%   { transform: translate(0,    0);    opacity: 1; }
          35%  { transform: translate(21px, -82px); opacity: 1; }
          55%  { transform: translate(21px, -82px); opacity: 0; }
          100% { transform: translate(0,    0);    opacity: 1; }
        }
        @keyframes tutoTileLand {
          0%   { opacity: 0; transform: scale(0.6); }
          30%  { opacity: 0; transform: scale(0.6); }
          45%  { opacity: 1; transform: scale(1.1); }
          55%  { opacity: 1; transform: scale(1);   }
          80%  { opacity: 1; transform: scale(1);   }
          100% { opacity: 0; transform: scale(1);   }
        }
        @keyframes tutoScorePop {
          0%   { opacity: 0; transform: scale(0.5) translateY(8px); }
          50%  { opacity: 0; transform: scale(0.5) translateY(8px); }
          65%  { opacity: 1; transform: scale(1.2) translateY(-4px); }
          75%  { opacity: 1; transform: scale(1)   translateY(0);   }
          88%  { opacity: 1; transform: scale(1)   translateY(0);   }
          100% { opacity: 0; transform: scale(1)   translateY(0);   }
        }
        @keyframes tutoArrow {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          38%  { opacity: 1; }
          50%  { opacity: 0; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// B. RESIZEOBSERVER MULTI-CIBLES + THROTTLE
// ════════════════════════════════════════════════════════════════

/**
 * Hook interne — observe un ou plusieurs éléments et déclenche
 * le callback de recalcul, throttlé via requestAnimationFrame.
 *
 * @param {boolean}          active    - activer l'observer
 * @param {HTMLElement[]}    elements  - éléments à observer (peuvent être null)
 * @param {() => void}       onResize  - callback appelé après debounce
 */
function useResizeObserver(active, elements, onResize) {
  const rafRef = useRef(null);
  const cbRef  = useRef(onResize);
  cbRef.current = onResize; // toujours à jour sans re-créer l'observer

  useEffect(() => {
    if (!active || elements.every(el => !el)) return;

    const throttled = () => {
      if (rafRef.current) return; // déjà en attente
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        cbRef.current();
      });
    };

    const ro = new ResizeObserver(throttled);
    const observed = elements.filter(Boolean);
    observed.forEach(el => ro.observe(el));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active, ...elements]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ════════════════════════════════════════════════════════════════
// OVERLAY PRINCIPAL
// ════════════════════════════════════════════════════════════════

const buildSteps = (t) => [
  { target: null,            position: 'center', icon: '🎩', title: t('tuto_step0_title'), body: t('tuto_step0_body'), hint: null,                   showIntroAnim: true  },
  { target: 'board',         position: 'right',  icon: '🗂️', title: t('tuto_step1_title'), body: t('tuto_step1_body'), hint: null,                   showIntroAnim: false },
  { target: 'board-center',  position: 'right',  icon: '⭐', title: t('tuto_step2_title'), body: t('tuto_step2_body'), hint: null,                   showIntroAnim: false },
  { target: 'board-legend',  position: 'top',    icon: '🎯', title: t('tuto_step3_title'), body: t('tuto_step3_body'), hint: null,                   showIntroAnim: false },
  { target: 'tile-rack',     position: 'top',    icon: '🔤', title: t('tuto_step4_title'), body: t('tuto_step4_body'), hint: t('tuto_step4_hint'),   showIntroAnim: false },
  { target: 'score-preview', position: 'left',   icon: '🔢', title: t('tuto_step5_title'), body: t('tuto_step5_body'), hint: null,                   showIntroAnim: false },
  { target: 'btn-validate',  position: 'left',   icon: '✅', title: t('tuto_step6_title'), body: t('tuto_step6_body'), hint: t('tuto_step6_hint'),   showIntroAnim: false },
  { target: 'btn-pass',      position: 'left',   icon: '⏭️', title: t('tuto_step7_title'), body: t('tuto_step7_body'), hint: null,                   showIntroAnim: false },
  { target: 'score-panel',   position: 'left',   icon: '🏆', title: t('tuto_step8_title'), body: t('tuto_step8_body'), hint: null,                   showIntroAnim: false },
];

const PAD      = 16;
const BUBBLE_W = 320;

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

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
    case 'right': top = vRect.top + vRect.height / 2 - 140; left = vRect.right + PAD; break;
    case 'left':  top = vRect.top + vRect.height / 2 - 140; left = vRect.left - BUBBLE_W - PAD; break;
    case 'top':   top = vRect.top - PAD - 260; left = vRect.left + vRect.width / 2 - BUBBLE_W / 2; break;
    default:      top = vRect.bottom + PAD;    left = vRect.left + vRect.width / 2 - BUBBLE_W / 2;
  }
  left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12));
  top  = Math.max(12, Math.min(top,  vh - 320));
  return { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${BUBBLE_W}px`, zIndex: 10001 };
}

export default function TutorialOverlay({ t }) {
  const {
    isOpen, step, nextStep, prevStep, closeTutorial,
    getRef, stepConditions,
  } = useTutorialContext();

  const steps        = useMemo(() => buildSteps(t), [t]);
  const total        = steps.length;
  const current      = steps[step] ?? steps[0];
  const isConditional = Boolean(stepConditions[step]);

  const [vRect, setVRect]             = useState(null);
  const [bubbleStyle, setBubbleStyle] = useState({});
  const [visible, setVisible]         = useState(false);

  const dialogRef     = useRef(null);
  const triggerRef    = useRef(null);
  const titleId       = useRef(`tuto-title-${Math.random().toString(36).slice(2)}`).current;
  const descId        = useRef(`tuto-desc-${Math.random().toString(36).slice(2)}`).current;

  // ── Recalcul position ──────────────────────────────────────────
  const recalc = useCallback(() => {
    const ref  = current.target ? getRef(current.target) : null;
    const rect = getViewportRect(ref);
    setVRect(rect);
    setBubbleStyle(getBubbleStyle(rect, current.position));
  }, [current, getRef]);

  // ── ResizeObserver multi-cibles ───────────────────────────────
  // Observer 1 : élément cible courant (spotlight)
  const targetEl = current.target ? getRef(current.target)?.current ?? null : null;
  // Observer 2 : body (layout shifts globaux — sidebar, scroll, etc.)
  useResizeObserver(isOpen, [targetEl, typeof document !== 'undefined' ? document.body : null], recalc);

  // ── Window resize (fallback pour viewBox SVG) ─────────────────
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [isOpen, recalc]);

  // ── Ouverture / changement d'étape ────────────────────────────
  useEffect(() => {
    if (!isOpen) { setVisible(false); return; }

    if (!triggerRef.current) triggerRef.current = document.activeElement;

    recalc();

    if (current.target) {
      const el = getRef(current.target)?.current;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const timer = setTimeout(() => {
      setVisible(true);
      dialogRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, step, recalc, current.target, getRef]);

  // ── Restauration focus ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current?.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // ── Focus trap + navigation clavier ──────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!dialogRef.current) return;
    if (e.key === 'Escape')                    { e.preventDefault(); closeTutorial(); return; }
    if (e.key === 'ArrowRight' && !isConditional) { e.preventDefault(); nextStep(total); return; }
    if (e.key === 'ArrowLeft')                 { e.preventDefault(); prevStep(); return; }
    if (e.key === 'Tab') {
      const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else             { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
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
    return [`M0,0 H${vw} V${vh} H0 Z`,
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
        style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none',
          opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
        width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}
        aria-hidden="true" focusable="false"
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

      {/* ── Live region ───────────────────────────────────── */}
      <div
        aria-live="polite" aria-atomic="true"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {visible ? `${t('tuto_step_label')} ${step + 1} ${t('tuto_step_of')} ${total} : ${current.title}. ${current.body}` : ''}
      </div>

      {/* ── Bulle ─────────────────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descId}
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
        {/* Barre de progression */}
        <div
          role="progressbar"
          aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={total}
          aria-label={`${t('tuto_progress_label')}: ${step + 1} / ${total}`}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
            background: 'var(--border-muted)', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}
        >
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold, #C8A830)', transition: 'width 0.4s ease' }} />
        </div>

        {/* Compteur + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }} aria-hidden="true">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {step + 1} / {total}
          </span>
          {isConditional && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--olive, #4A5E2A)',
              background: 'rgba(74,94,42,0.12)', border: '1px solid var(--olive)', borderRadius: '2px',
              padding: '2px 8px', animation: 'tutoPulse 1.8s ease-in-out infinite' }}>
              {t('tuto_action_required')}
            </span>
          )}
        </div>

        {/* Animation SVG intro (étape 0 uniquement) */}
        {current.showIntroAnim && <IntroAnimation />}

        {/* Titre */}
        {!current.showIntroAnim && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0 }} aria-hidden="true">{current.icon}</span>
            <h3 id={titleId} style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 900,
              color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
              {current.title}
            </h3>
          </div>
        )}
        {current.showIntroAnim && (
          <h3 id={titleId} style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 900,
            color: 'var(--text-primary)', margin: '0 0 10px', textAlign: 'center' }}>
            {current.title}
          </h3>
        )}

        {/* Corps */}
        <p id={descId} style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '0.88rem',
          color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px',
          textAlign: current.showIntroAnim ? 'center' : 'left' }}>
          {current.body}
        </p>

        {/* Hint */}
        {current.hint && (
          <div role="note" aria-label={t('tuto_hint_label')}
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem',
              color: 'var(--olive, #4A5E2A)', background: 'rgba(74,94,42,0.08)',
              border: '1.5px dashed var(--olive)', borderRadius: '2px',
              padding: '8px 12px', marginBottom: '16px', lineHeight: 1.5 }}>
            👆 {current.hint}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={closeTutorial} aria-label={t('tuto_skip_aria')}
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '4px 0', marginRight: 'auto', textDecoration: 'underline' }}>
            {t('tuto_skip')}
          </button>

          {step > 0 && (
            <button onClick={prevStep} aria-label={t('tuto_prev_aria')}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)',
                background: 'transparent', border: '2px solid var(--border-primary)',
                borderRadius: '2px', cursor: 'pointer', padding: '8px 14px',
                boxShadow: '3px 3px 0 var(--border-primary)' }}>
              ← {t('tuto_prev')}
            </button>
          )}

          {!isConditional && (
            <button
              onClick={() => step >= total - 1 ? closeTutorial() : nextStep(total)}
              aria-label={step >= total - 1 ? t('tuto_finish_aria') : t('tuto_next_aria')}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-invert, #FAF3E0)',
                background: 'var(--olive, #4A5E2A)', border: '2px solid var(--olive-dk, #3D4A20)',
                borderRadius: '2px', cursor: 'pointer', padding: '8px 16px',
                boxShadow: '3px 3px 0 var(--olive-dk, #3D4A20)' }}>
              {step >= total - 1 ? `${t('tuto_finish')} ✓` : `${t('tuto_next')} →`}
            </button>
          )}

          {isConditional && (
            <span aria-live="off" style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem',
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {t('tuto_waiting')}
            </span>
          )}
        </div>
      </div>

      {/* ── Keyframes globaux ─────────────────────────────── */}
      <style>{`
        @keyframes tutoDash  { to { stroke-dashoffset: -24; } }
        @keyframes tutoPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}