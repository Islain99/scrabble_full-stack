// src/components/MoveHistory.jsx
//
// Historique des coups d'une partie (solo et multijoueur) : fenêtre qui liste
// les coups du plus récent au plus ancien, à partir de gameState.moves
// (rempli par le serveur : mots posés, passes, échanges, temps écoulé).
import React, { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RetroButton } from './ui';

function MoveLine({ move, name, number, isLast }) {
  const { t, tp } = useLanguage();
  let detail;
  if (move.kind === 'play')      detail = (move.words ?? []).join(' · ');
  else if (move.kind === 'swap') detail = tp('mh_swap', move.count ?? 0);
  else if (move.kind === 'timeout') detail = t('mh_timeout');
  else                           detail = t('mh_pass');

  return (
    <li className={isLast ? 'mh-row mh-row--last' : 'mh-row'}>
      <span className="mh-num">{number}</span>
      <span className="mh-name">{name}</span>
      <span className={move.kind === 'play' ? 'mh-words' : 'mh-other'}>{detail}</span>
      <span className="mh-score">{move.kind === 'play' ? `+${move.score}` : ''}</span>
    </li>
  );
}

export default function MoveHistory({ open, onClose, moves = [], players = [] }) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nameOf = (id) => players.find(p => p.id === id)?.name ?? '—';
  const total  = moves.length;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('mh_title')} className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel" onClick={e => e.stopPropagation()}>
        <h2 className="mh-title">{t('mh_title')}</h2>
        {total === 0 ? (
          <p className="mh-empty">{t('mh_empty')}</p>
        ) : (
          <ol className="mh-list">
            {moves.slice().reverse().map((m, i) => (
              <MoveLine
                key={total - i}
                move={m}
                number={total - i}
                name={nameOf(m.player_id)}
                isLast={i === 0}
              />
            ))}
          </ol>
        )}
        <RetroButton variant="default" fullWidth onClick={onClose}>{t('mh_close')}</RetroButton>
      </div>
    </div>
  );
}

/** Bouton rond (même style que le bouton pause) qui ouvre l'historique. */
export function HistoryButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="pause-btn history-btn"
      onClick={onClick}
      aria-label={t('mh_title')}
      title={t('mh_title')}
    >
      <span aria-hidden="true">☰</span>
    </button>
  );
}
