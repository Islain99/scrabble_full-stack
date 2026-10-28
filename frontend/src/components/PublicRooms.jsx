// src/components/PublicRooms.jsx
//
// Salons publics (P1) : liste en direct des salles publiques en attente, avec
// filtres côté client (nom ou hôte, minuteur). Un clic ouvre les règles de la
// salle (aperçu), d'où l'on rejoint.
import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { usePublicRooms } from '../hooks/usePublicRooms';
import { TURN_CHOICES, formatTurn, roomDisplayName } from '../utils/roomRules';
import { Spinner } from './ui';

/** « à l'instant », « il y a 4 min », « il y a 1 h » */
function ago(ms, now, t) {
  if (!ms || !now) return '';
  const min = Math.max(0, Math.floor((now - ms) / 60000));
  if (min < 1) return t('pr_just_now');
  if (min < 60) return t('pr_ago', { time: `${min} min` });
  return t('pr_ago', { time: `${Math.floor(min / 60)} h` });
}

export default function PublicRooms({ onSelect, enabled = true }) {
  const { t } = useLanguage();
  const { rooms, live } = usePublicRooms(enabled);
  const [query, setQuery] = useState('');
  const [timer, setTimer] = useState('all');   // 'all' | 'none' | secondes
  const [now, setNow] = useState(0);

  // Horloge pour les « il y a … » (pas d'heure lue pendant le rendu)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rooms ?? []).filter(r => {
      const seconds = r.settings?.turn_seconds ?? 0;
      if (timer === 'none' && seconds !== 0) return false;
      if (typeof timer === 'number' && seconds !== timer) return false;
      if (!q) return true;
      const name = roomDisplayName(r.settings, r.host_name, t).toLowerCase();
      return name.includes(q) || (r.host_name ?? '').toLowerCase().includes(q);
    });
  }, [rooms, query, timer, t]);

  const timerOptions = [
    { value: 'all', label: t('pr_all') },
    { value: 'none', label: t('pr_no_timer') },
    ...TURN_CHOICES.filter(Boolean).map(v => ({ value: v, label: formatTurn(v, t) })),
  ];

  return (
    <section className="pr" aria-labelledby="pr-title">
      <header className="pr-head">
        <h2 id="pr-title" className="pr-title">{t('pr_title')}</h2>
        {rooms !== null && (
          <span className="pr-live" title={live ? t('pr_live') : t('pr_polling')}>
            <span className={live ? 'pr-dot pr-dot--live' : 'pr-dot'} aria-hidden="true" />
            {live ? t('pr_live') : t('pr_polling')}
          </span>
        )}
      </header>

      <div className="pr-filters">
        <input
          className="rr-input pr-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('pr_search')}
          aria-label={t('pr_search')}
        />
        <div className="rr-chips" role="radiogroup" aria-label={t('rr_turn')}>
          {timerOptions.map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={timer === opt.value}
              className="rr-chip"
              onClick={() => setTimer(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rooms === null ? (
        <div className="pr-empty"><Spinner size="sm" /></div>
      ) : visible.length === 0 ? (
        <p className="pr-empty">{rooms.length === 0 ? t('pr_empty') : t('pr_no_match')}</p>
      ) : (
        <ul className="pr-list">
          {visible.map(r => (
            <li key={r.room_id}>
              <button type="button" className="pr-row" onClick={() => onSelect(r.room_id)}>
                <span className="pr-main">
                  <span className="pr-name">{roomDisplayName(r.settings, r.host_name, t)}</span>
                  <span className="pr-meta">
                    {t('rr_hosted_by', { name: r.host_name })}
                    {r.created_at ? ` · ${ago(r.created_at, now, t)}` : ''}
                  </span>
                </span>
                <span className="pr-tags">
                  <span className="pr-tag">
                    {r.settings?.turn_seconds ? `⏱ ${formatTurn(r.settings.turn_seconds, t)}` : t('pr_no_timer')}
                  </span>
                  {r.settings?.allow_swap === false && <span className="pr-tag">{t('pr_no_swap')}</span>}
                  {r.settings?.target_score && <span className="pr-tag">{r.settings.target_score} pts</span>}
                </span>
                <span className="pr-go" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
