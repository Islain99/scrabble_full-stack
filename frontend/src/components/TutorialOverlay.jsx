// src/components/TutorialOverlay.jsx
// Overlay tutoriel interactif pas-à-pas.
// Affiche un spotlight sur l'élément cible (via data-tutorial="id")
// et une bulle de texte positionnée dynamiquement.
//
// Usage :
//   <TutorialOverlay isOpen={isOpen} step={step} onNext={nextStep}
//                    onPrev={prevStep} onClose={closeTutorial} t={t} />

import React, { useEffect, useState, useRef, useCallback } from 'react';

// ── Définition des étapes ─────────────────────────────────────────
// `target` correspond à data-tutorial="<id>" dans le DOM.
// `position` : où placer la bulle par rapport à la cible.
// null target = étape centrée (intro/outro).

const buildSteps = (t) => [
  {
    target:   null,
    position: 'center',
    icon:     '🎩',
    title:    t('tuto_step0_title'),
    body:     t('tuto_step0_body'),
  },
  {
    target:   'board',
    position: 'right',
    icon:     '🗂️',
    title:    t('tuto_step1_title'),
    body:     t('tuto_step1_body'),
  },
  {
    target:   'board-center',
    position: 'right',
    icon:     '⭐',
    title:    t('tuto_step2_title'),
    body:     t('tuto_step2_body'),
  },
  {
    target:   'board-bonus',
    position: 'right',
    icon:     '🎯',
    title:    t('tuto_step3_title'),
    body:     t('tuto_step3_body'),
  },
  {
    target:   'tile-rack',
    position: 'top',
    icon:     '🔤',
    title:    t('tuto_step4_title'),
    body:     t('tuto_step4_body'),
  },
  {
    target:   'score-preview',
    position: 'left',
    icon:     '🔢',
    title:    t('tuto_step5_title'),
    body:     t('tuto_step5_body'),
  },
  {
    target:   'btn-validate',
    position: 'left',
    icon:     '✅',
    title:    t('tuto_step6_title'),
    body:     t('tuto_step6_body'),
  },
  {
    target:   'btn-pass',
    position: 'left',
    icon:     '⏭️',
    title:    t('tuto_step7_title'),
    body:     t('tuto_step7_body'),
  },
  {
    target:   'score-panel',
    position: 'left',
    icon:     '🏆',
    title:    t('tuto_step8_title'),
    body:     t('tuto_step8_body'),
  },
];

// ── Helpers ───────────────────────────────────────────────────────

function getTargetRect(targetId) {
  if (!targetId) return null;
  const el = document.querySelector(`[data-tutorial="${targetId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top:    rect.top    + window.scrollY,
    left:   rect.left   + window.scrollX,
    width:  rect.width,
    height: rect.height,
    bottom: rect.bottom + window.scrollY,
    right:  rect.right  + window.scrollX,
  };
}

const PAD = 16; // padding autour du spotlight
const BUBBLE_W = 320;

function getBubbleStyle(rect, position) {
  if (!rect || position === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${BUBBLE_W}px`,
      zIndex: 10001,
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Coordonnées viewport (rect est en pageY)
  const vRect = {
    top:    rect.top    - window.scrollY,
    left:   rect.left   - window.scrollX,
    bottom: rect.bottom - window.scrollY,
    right:  rect.right  - window.scrollX,
  };

  let top, left;

  switch (position) {
    case 'right':
      top  = vRect.top + vRect.height / 2 - 100;
      left = vRect.right + PAD;
      break;
    case 'left':
      top  = vRect.top + vRect.height / 2 - 100;
      left = vRect.left - BUBBLE_W - PAD;
      break;
    case 'top':
      top  = vRect.top - PAD - 200;
      left = vRect.left + vRect.width / 2 - BUBBLE_W / 2;
      break;
    case 'bottom':
    default:
      top  = vRect.bottom + PAD;
      left = vRect.left + vRect.width / 2 - BUBBLE_W / 2;
  }

  // Clamp dans viewport
  left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12));
  top  = Math.max(12, Math.min(top,  vh - 240));

  return {
    position: 'fixed',
    top:      `${top}px`,
    left:     `${left}px`,
    width:    `${BUBBLE_W}px`,
    zIndex:   10001,
  };
}

// ── Composant principal ───────────────────────────────────────────

export default function TutorialOverlay({ isOpen, step, onNext, onPrev, onClose, t }) {
  const [rect, setRect]             = useState(null);
  const [bubbleStyle, setBubbleStyle] = useState({});
  const [visible, setVisible]       = useState(false);
  const animRef                     = useRef(null);

  const steps = buildSteps(t);
  const total = steps.length;
  const current = steps[step] ?? steps[0];

  // Recalcul de la position à chaque changement d'étape
  const recalc = useCallback(() => {
    const r = getTargetRect(current.target);
    setRect(r);
    setBubbleStyle(getBubbleStyle(r, current.position));
  }, [current]);

  useEffect(() => {
    if (!isOpen) { setVisible(false); return; }
    recalc();
    // Scroll vers la cible si nécessaire
    if (current.target) {
      const el = document.querySelector(`[data-tutorial="${current.target}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Animation d'entrée
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [isOpen, step, recalc, current.target]);

  // Recalcul au resize
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [isOpen, recalc]);

  if (!isOpen) return null;

  // ── Spotlight clip ────────────────────────────────────────────
  // On utilise un SVG pleine page avec un trou découpé sur la cible.
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spotlightPath = (() => {
    if (!rect || current.target === null) {
      // Pas de spotlight : fond uni semi-opaque
      return `M0,0 H${vw} V${vh} H0 Z`;
    }
    const vRect = {
      top:    Math.max(0, rect.top    - window.scrollY - PAD),
      left:   Math.max(0, rect.left   - window.scrollX - PAD),
      bottom: Math.min(vh, rect.bottom - window.scrollY + PAD),
      right:  Math.min(vw, rect.right  - window.scrollX + PAD),
    };
    const r = 6; // border-radius du trou
    // Outer rect + inner cutout (even-odd rule)
    return [
      `M0,0 H${vw} V${vh} H0 Z`,
      `M${vRect.left+r},${vRect.top}`,
      `H${vRect.right-r} Q${vRect.right},${vRect.top} ${vRect.right},${vRect.top+r}`,
      `V${vRect.bottom-r} Q${vRect.right},${vRect.bottom} ${vRect.right-r},${vRect.bottom}`,
      `H${vRect.left+r} Q${vRect.left},${vRect.bottom} ${vRect.left},${vRect.bottom-r}`,
      `V${vRect.top+r} Q${vRect.left},${vRect.top} ${vRect.left+r},${vRect.top} Z`,
    ].join(' ');
  })();

  const progress = ((step + 1) / total) * 100;

  return (
    <>
      {/* ── Fond assombri avec spotlight ─────────────────── */}
      <svg
        style={{
          position:   'fixed',
          inset:      0,
          zIndex:     10000,
          pointerEvents: 'none',
          opacity:    visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        width={vw}
        height={vh}
        viewBox={`0 0 ${vw} ${vh}`}
      >
        <path
          d={spotlightPath}
          fill="rgba(15, 12, 8, 0.78)"
          fillRule="evenodd"
        />
        {rect && current.target && (
          <rect
            x={Math.max(0, rect.left - window.scrollX - PAD)}
            y={Math.max(0, rect.top  - window.scrollY - PAD)}
            width={rect.width  + PAD * 2}
            height={rect.height + PAD * 2}
            rx={6}
            fill="none"
            stroke="var(--gold, #C8A830)"
            strokeWidth="2.5"
            strokeDasharray="8 4"
            style={{ animation: 'tutoDash 1.2s linear infinite' }}
          />
        )}
      </svg>

      {/* ── Bulle de texte ────────────────────────────────── */}
      <div
        style={{
          ...bubbleStyle,
          opacity:    visible ? 1 : 0,
          transform:  bubbleStyle.transform
            ? `${bubbleStyle.transform} translateY(${visible ? 0 : '12px'})`
            : `translateY(${visible ? 0 : '12px'})`,
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          background: 'var(--bg-card, #FAF3E0)',
          border:     '3px solid var(--border-primary, #1E1A12)',
          borderRadius: '4px',
          boxShadow:  '6px 6px 0 var(--border-primary, #1E1A12)',
          padding:    '24px',
          fontFamily: 'inherit',
        }}
      >
        {/* Barre de progression */}
        <div style={{
          position:     'absolute',
          top:          0,
          left:         0,
          right:        0,
          height:       '3px',
          background:   'var(--border-muted, #C8B89A)',
          borderRadius: '4px 4px 0 0',
          overflow:     'hidden',
        }}>
          <div style={{
            height:     '100%',
            width:      `${progress}%`,
            background: 'var(--gold, #C8A830)',
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Compteur */}
        <div style={{
          fontFamily:    "'DM Mono', monospace",
          fontSize:      '0.6rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color:         'var(--text-muted)',
          marginBottom:  '12px',
        }}>
          {step + 1} / {total}
        </div>

        {/* Icône + Titre */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0 }}>{current.icon}</span>
          <h3 style={{
            fontFamily:  "'Playfair Display', serif",
            fontSize:    '1.1rem',
            fontWeight:  900,
            color:       'var(--text-primary)',
            margin:      0,
            lineHeight:  1.2,
          }}>
            {current.title}
          </h3>
        </div>

        {/* Corps */}
        <p style={{
          fontFamily:   "'Libre Baskerville', Georgia, serif",
          fontSize:     '0.88rem',
          color:        'var(--text-secondary)',
          lineHeight:   1.6,
          margin:       '0 0 20px',
        }}>
          {current.body}
        </p>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>

          {/* Passer */}
          <button
            onClick={onClose}
            style={{
              fontFamily:    "'DM Mono', monospace",
              fontSize:      '0.65rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         'var(--text-muted)',
              background:    'transparent',
              border:        'none',
              cursor:        'pointer',
              padding:       '4px 0',
              marginRight:   'auto',
              textDecoration: 'underline',
            }}
          >
            {t('tuto_skip')}
          </button>

          {/* Précédent */}
          {step > 0 && (
            <button
              onClick={onPrev}
              style={{
                fontFamily:    "'DM Mono', monospace",
                fontSize:      '0.72rem',
                fontWeight:    500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         'var(--text-primary)',
                background:    'transparent',
                border:        '2px solid var(--border-primary)',
                borderRadius:  '2px',
                cursor:        'pointer',
                padding:       '8px 14px',
                boxShadow:     '3px 3px 0 var(--border-primary)',
                transition:    'opacity 0.15s',
              }}
            >
              ← {t('tuto_prev')}
            </button>
          )}

          {/* Suivant / Terminer */}
          <button
            onClick={() => step >= total - 1 ? onClose() : onNext(total)}
            style={{
              fontFamily:    "'DM Mono', monospace",
              fontSize:      '0.72rem',
              fontWeight:    500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         'var(--text-invert, #FAF3E0)',
              background:    'var(--olive, #4A5E2A)',
              border:        '2px solid var(--olive-dk, #3D4A20)',
              borderRadius:  '2px',
              cursor:        'pointer',
              padding:       '8px 16px',
              boxShadow:     '3px 3px 0 var(--olive-dk, #3D4A20)',
              transition:    'opacity 0.15s',
            }}
          >
            {step >= total - 1 ? `${t('tuto_finish')} ✓` : `${t('tuto_next')} →`}
          </button>
        </div>
      </div>

      {/* ── Keyframe animation ────────────────────────────── */}
      <style>{`
        @keyframes tutoDash {
          to { stroke-dashoffset: -24; }
        }
      `}</style>
    </>
  );
}