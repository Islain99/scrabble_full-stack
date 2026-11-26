// src/components/admin/AdminOverview.jsx
// Vue d'ensemble : chiffres clés (joueurs, parties, messagerie), activité quotidienne,
// parties solo par difficulté, meilleurs joueurs multijoueur.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getOverview } from '../../api/adminService';
import { Spinner } from '../ui';
import AdminBarChart from './AdminBarChart';
import { errorOf, formatDate, formatNumber, goAdmin } from './adminUtils';

const PERIODS = [7, 30, 90];
const METRICS = ['signups', 'solo', 'multiplayer', 'messages'];

function Kpi({ label, value, hint, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className="adm-kpi" data-tone={tone} onClick={onClick}>
      <span className="adm-kpi-label">{label}</span>
      <span className="adm-kpi-value">{value}</span>
      {hint && <span className="adm-kpi-hint">{hint}</span>}
    </Tag>
  );
}

export default function AdminOverview() {
  const { t, language } = useLanguage();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('signups');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getOverview(days)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [days, t]);

  const n = (v) => formatNumber(v, language);
  const periodLabel = t('adm_period_days', { count: days });

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!data) return <div className="adm-loading"><Spinner size={18} /></div>;

  const { users, games, chat } = data;
  const diffTotal = Object.values(data.solo_by_difficulty).reduce((a, b) => a + b, 0);
  const diffMax = Math.max(1, ...Object.values(data.solo_by_difficulty));

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <span className="adm-toolbar-label">{t('adm_period')}</span>
        {PERIODS.map(p => (
          <button key={p} type="button" className="s-chip" data-active={days === p} onClick={() => setDays(p)}>
            {t('adm_period_days', { count: p })}
          </button>
        ))}
        <span className="adm-toolbar-note">{t('adm_updated_at', { date: formatDate(data.generated_at, language) })}</span>
      </div>

      <section aria-labelledby="adm-kpi-players">
        <h3 id="adm-kpi-players" className="adm-h3">{t('adm_section_players')}</h3>
        <div className="adm-kpis">
          <Kpi label={t('adm_kpi_total_users')} value={n(users.total)}
               hint={t('adm_kpi_new', { count: n(users.new_period), period: periodLabel })} onClick={() => goAdmin('users')} />
          <Kpi label={t('adm_kpi_active_24h')} value={n(users.active_24h)} hint={t('adm_kpi_active_7d', { count: n(users.active_7d) })} />
          <Kpi label={t('adm_kpi_active_period')} value={n(users.active_period)} hint={periodLabel} />
          <Kpi label={t('adm_kpi_profile_complete')} value={n(users.profile_complete)}
               hint={users.total ? `${Math.round(users.profile_complete / users.total * 100)} %` : '—'} />
          <Kpi label={t('adm_kpi_disabled')} value={n(users.disabled)} tone={users.disabled ? 'warn' : undefined} />
          <Kpi label={t('adm_kpi_admins')} value={n(users.admins)} />
        </div>
      </section>

      <section aria-labelledby="adm-kpi-games">
        <h3 id="adm-kpi-games" className="adm-h3">{t('adm_section_games')}</h3>
        <div className="adm-kpis">
          <Kpi label={t('adm_kpi_solo')} value={n(games.solo_period)} hint={t('adm_kpi_since_start', { count: n(games.solo_total) })} />
          <Kpi label={t('adm_kpi_solo_win_rate')} value={`${games.solo_win_rate} %`} hint={t('adm_kpi_avg_score', { score: n(games.solo_avg_score) })} />
          <Kpi label={t('adm_kpi_mp')} value={n(games.mp_period)} hint={t('adm_kpi_since_start', { count: n(games.mp_total) })} />
          <Kpi label={t('adm_kpi_mp_live')} value={n(games.mp_active)} hint={t('adm_kpi_mp_waiting', { count: n(games.mp_waiting) })} />
        </div>
      </section>

      <section aria-labelledby="adm-kpi-chat">
        <h3 id="adm-kpi-chat" className="adm-h3">{t('adm_section_chat')}</h3>
        <div className="adm-kpis">
          <Kpi label={t('adm_kpi_messages')} value={n(chat.messages_period)} hint={periodLabel} />
          <Kpi label={t('adm_kpi_reports')} value={n(chat.reports_pending)} tone={chat.reports_pending ? 'alert' : undefined}
               hint={chat.reports_pending ? t('adm_kpi_reports_hint') : undefined}
               onClick={chat.reports_pending ? () => { window.location.hash = '#/messages'; } : undefined} />
          <Kpi label={t('adm_kpi_muted')} value={n(chat.muted_now)}
               onClick={chat.muted_now ? () => goAdmin('users?status=muted') : undefined} />
        </div>
      </section>

      <section aria-labelledby="adm-activity">
        <h3 id="adm-activity" className="adm-h3">{t('adm_section_activity')}</h3>
        <div className="adm-toolbar">
          {METRICS.map(m => (
            <button key={m} type="button" className="s-chip" data-active={metric === m} onClick={() => setMetric(m)}>
              {t(`adm_metric_${m}`)}
            </button>
          ))}
        </div>
        <AdminBarChart title={`${t(`adm_metric_${metric}`)} · ${periodLabel}`} points={data.series} valueKey={metric} />
      </section>

      <div className="adm-two">
        <section className="adm-panel" aria-labelledby="adm-diff">
          <h3 id="adm-diff" className="adm-h3">{t('adm_section_difficulty')}</h3>
          {diffTotal === 0 ? <p className="adm-empty">{t('adm_no_data')}</p> : (
            <ul className="adm-hbars">
              {Object.entries(data.solo_by_difficulty).sort((a, b) => b[1] - a[1]).map(([d, count]) => (
                <li key={d}>
                  <span className="adm-hbar-label">{t(`diff_${d}_label`) === `diff_${d}_label` ? d : t(`diff_${d}_label`)}</span>
                  <span className="adm-hbar-track"><span className="adm-hbar" style={{ width: `${count / diffMax * 100}%` }} /></span>
                  <span className="adm-hbar-value">{n(count)} · {Math.round(count / diffTotal * 100)} %</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-panel" aria-labelledby="adm-top">
          <h3 id="adm-top" className="adm-h3">{t('adm_section_top')}</h3>
          {data.top_players.length === 0 ? <p className="adm-empty">{t('adm_no_data')}</p> : (
            <ol className="adm-top">
              {data.top_players.map(p => (
                <li key={p.id}>
                  <button type="button" className="adm-link" onClick={() => goAdmin(`users/${p.id}`)}>{p.display_name}</button>
                  <span className="adm-top-meta">{p.mp_rating} Elo · {t('adm_games_count', { count: n(p.mp_games) })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
