// src/components/mobile/MobileGame.jsx
//
// Briques de l'écran de jeu sur téléphone (solo et multijoueur).
// Mise en page : styles/mobile.css (portrait et paysage).
//
//   <MobileGameLayout
//     top={<ScoreStrip …/>}
//     board={<Board compact …/>}
//     status={…}
//     dock={<RackDock …/>}
//   />

import React, { useEffect, useRef, useState } from 'react';
import { useTutorialRef } from '../../context/TutorialContext';

const RACK_SIZE = 7;

// ── Mise en page ────────────────────────────────────────────────────

export function MobileGameLayout({ top, board, status, dock }) {
  // L'écran de jeu tient sur un seul écran : on bloque le défilement de la
  // page tant qu'il est affiché (classe retirée en quittant la partie).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('mg-lock');
    return () => root.classList.remove('mg-lock');
  }, []);

  // La ligne d'état est placée sous le plateau en portrait, et dans la
  // colonne de droite en paysage : le CSS affiche l'une ou l'autre.
  return (
    <div className="mg">
      <div className="mg-top">{top}</div>
      <div className="mg-board">
        <div className="mg-board-inner" data-tutorial="board">{board}</div>
        <div className="mg-status mg-status--board" aria-live="polite">{status}</div>
      </div>
      <div className="mg-status mg-status--side">{status}</div>
      <div className="mg-dock">{dock}</div>
    </div>
  );
}

// ── Bandeau des scores ──────────────────────────────────────────────

/**
 * @param {{
 *   players: Array<{ id:number, name:string, score:number }>,
 *   activeIndex: number,
 *   bagCount?: number|null,      // null → masqué
 *   bagLabel: string,
 *   extra?: React.ReactNode,     // ex. bouton tutoriel
 *   below?: React.ReactNode,     // ex. minuteur
 * }} props
 */
export function ScoreStrip({ players, activeIndex, bagCount = null, bagLabel, extra = null, below = null }) {
  const panelRef = useTutorialRef('score-panel');
  return (
    <>
      <div className="mg-strip" ref={panelRef}>
        {players.map((p, i) => (
          <div
            key={p.id ?? i}
            className="mg-player"
            data-active={i === activeIndex}
            aria-current={i === activeIndex ? 'true' : undefined}
          >
            <span className="mg-player-name">{p.name}</span>
            <span className="mg-player-score">{p.score}</span>
          </div>
        ))}
        {bagCount !== null && (
          <div className="mg-bag" title={bagLabel}>
            <span className="mg-bag-count">{bagCount}</span>
            <span className="mg-bag-label">{bagLabel}</span>
          </div>
        )}
        {extra}
      </div>
      {below && <div className="mg-timer">{below}</div>}
    </>
  );
}

// ── Chevalet ────────────────────────────────────────────────────────

/**
 * Chevalet tactile : toucher une lettre la sélectionne (mode « place »),
 * ou la coche pour l'échange (mode « swap »).
 *
 * @param {{
 *   tiles: Array<{ letter:string, score:number }>,
 *   mode: 'place'|'swap',
 *   isPressed: (tile, index) => boolean,
 *   onPress: (tile, index) => void,
 *   disabled?: boolean,
 *   labelFor: (tile) => string,   // texte lu par les lecteurs d'écran
 * }} props
 */
export function MobileRack({ tiles, mode, isPressed, onPress, disabled = false, labelFor }) {
  const rackRef = useTutorialRef('tile-rack');
  const empty = Math.max(0, RACK_SIZE - tiles.length);

  return (
    <div className="mg-rack" ref={rackRef} data-tutorial="tile-rack">
      {tiles.map((tile, i) => {
        const isJoker = tile.letter === '*';
        return (
          <button
            key={`${tile.letter}-${i}`}
            type="button"
            className="mg-tile"
            data-mode={mode}
            data-joker={isJoker}
            aria-pressed={isPressed(tile, i)}
            aria-label={labelFor(tile)}
            disabled={disabled}
            onClick={() => onPress(tile, i)}
          >
            {isJoker ? '★' : tile.letter}
            {tile.score > 0 && <span className="mg-tile-score">{tile.score}</span>}
          </button>
        );
      })}
      {Array.from({ length: empty }, (_, i) => <span key={`empty-${i}`} className="mg-slot" aria-hidden="true" />)}
    </div>
  );
}

// ── Boutons d'action ────────────────────────────────────────────────

export function ActionButton({ icon, label, onClick, disabled = false, variant = null, buttonRef, ...rest }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`mg-btn${variant ? ` mg-btn--${variant}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="mg-btn-icon" aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

/** Bouton principal « Jouer », avec l'aperçu des points. */
export function PlayButton({ label, points = null, onClick, disabled, buttonRef }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className="mg-btn mg-btn--play"
      onClick={onClick}
      disabled={disabled}
      data-tutorial="btn-validate"
    >
      <span>{label}</span>
      {points !== null && <span className="mg-btn-points">+{points}</span>}
    </button>
  );
}

/**
 * Menu « Plus » : actions moins fréquentes (tutoriel, abandon…).
 * placement : 'up' (défaut, menu au-dessus du bouton — barre d'actions en bas)
 *             ou 'down' (bouton placé en haut de l'écran, ex. bandeau des scores).
 * @param {{ label:string, items: Array<{ label:string, icon?:string, onSelect:()=>void, danger?:boolean }>, placement?:'up'|'down' }} props
 */
export function MoreMenu({ label, items, disabled = false, placement = 'up' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className={`mg-more mg-more--${placement}`} ref={wrapRef}>
      <ActionButton
        icon="⋯"
        label={label}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      {open && (
        <div className="mg-more-menu" role="menu">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`mg-more-item${item.danger ? ' mg-more-item--danger' : ''}`}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Contenu de la ligne d'état. */
export function StatusLine({ thinking = false, points = null, text = '' }) {
  return (
    <>
      {thinking && <span className="mg-status-spinner" aria-hidden="true" />}
      {points !== null && <span className="mg-status-score">+{points}</span>}
      <span>{text}</span>
    </>
  );
}
