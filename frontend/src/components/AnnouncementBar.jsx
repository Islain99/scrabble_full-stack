// src/components/AnnouncementBar.jsx
//
// Bandeau des annonces de l'administrateur (lot A4), sous la barre de navigation.
// Une annonce à la fois (flèche « suivante » s'il y en a plusieurs) ; fermée, elle
// ne revient plus sur cet appareil. Relu toutes les 5 minutes et à la connexion.
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getAnnouncements } from '../api/announcementsService';

const DISMISSED_KEY = 'scrabble-ann-dismissed';
const REFRESH_MS = 5 * 60 * 1000;
const ICONS = { info: 'ℹ️', event: '🎉', update: '✨', maintenance: '🛠️', promo: '🎁' };

function readDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY)) ?? []); } catch { return new Set(); }
}

export default function AnnouncementBar() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    getAnnouncements().then(list => setItems(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, userId]);

  const visible = items.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;
  const current = visible[Math.min(index, visible.length - 1)];
  const title = (language === 'en' ? current.title_en : current.title_fr) || current.title_fr;
  const body = (language === 'en' ? current.body_en : current.body_fr) || '';

  const dismiss = () => {
    const next = new Set(dismissed).add(current.id);
    // On ne garde que les annonces encore en cours (la liste ne grossit pas indéfiniment)
    const keep = [...next].filter(id => items.some(a => a.id === id));
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(keep)); } catch { /* stockage indisponible */ }
    setDismissed(next);
    setOpen(false);
  };

  const external = current.link && !current.link.startsWith('#/');

  return (
    <aside className="ann-bar" data-kind={current.kind} aria-label={t('ann_region')}>
      <div className="ann-inner">
        <span className="ann-icon" aria-hidden="true">{ICONS[current.kind] ?? ICONS.info}</span>
        <div className="ann-text">
          <strong className="ann-title">{title}</strong>
          {body && (
            open ? <p className="ann-body">{body}</p> : (
              <button type="button" className="ann-more" onClick={() => setOpen(true)} aria-expanded="false">
                {t('ann_read')}
              </button>
            )
          )}
        </div>
        <div className="ann-actions">
          {current.link && (
            <a className="ann-link" href={current.link} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {t('ann_open')}{external ? ' ↗' : ''}
            </a>
          )}
          {visible.length > 1 && (
            <button type="button" className="ann-btn" onClick={() => { setIndex((index + 1) % visible.length); setOpen(false); }}
                    aria-label={t('ann_next')}>
              {Math.min(index, visible.length - 1) + 1}/{visible.length} →
            </button>
          )}
          <button type="button" className="ann-btn" onClick={dismiss} aria-label={t('ann_dismiss')}>✕</button>
        </div>
      </div>
    </aside>
  );
}
