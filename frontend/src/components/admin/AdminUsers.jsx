// src/components/admin/AdminUsers.jsx
// Liste des joueurs : recherche (pseudo, e-mail, code ami), filtre, tri, pages.
// Un clic sur une ligne ouvre la fiche (#/admin/users/{id}).

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getAdminTiers, listUsers } from '../../api/adminService';
import TierBadge from '../TierBadge';
import { Spinner } from '../ui';
import UserBadges from './UserBadges';
import { errorOf, formatNumber, formatRelative, goAdmin } from './adminUtils';

const STATUSES = ['all', 'active', 'disabled', 'admin', 'muted'];
const SORTS = ['created', 'login', 'games', 'rating', 'name', 'credits'];
const PAGE_SIZE = 25;

const hashParam = (name) => {
  const query = (window.location.hash || '').split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
};
const initialStatus = () => {
  const s = hashParam('status');
  return STATUSES.includes(s) ? s : 'all';
};
// Lot A3 : niveau d'abonnement (all | default | id), lien depuis la rubrique Abonnements
const initialTier = () => {
  const v = hashParam('tier');
  return v === 'default' || /^\d+$/.test(v ?? '') ? v : 'all';
};

export default function AdminUsers() {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');          // valeur « posée » après la pause de frappe
  const [status, setStatus] = useState(initialStatus);
  const [tier, setTier] = useState(initialTier);
  const [tiers, setTiers] = useState([]);
  const [sort, setSort] = useState('created');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);  // requête dont `data` est la réponse

  // Recherche lancée 300 ms après la dernière frappe
  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    getAdminTiers().then(list => { if (!cancelled) setTiers(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const requestKey = JSON.stringify([query, status, sort, page, tier]);
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let cancelled = false;
    listUsers({ q: query, status, sort, page, page_size: PAGE_SIZE, tier })
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); })
      .finally(() => { if (!cancelled) setLoadedKey(JSON.stringify([query, status, sort, page, tier])); });
    return () => { cancelled = true; };
  }, [query, status, sort, page, tier, t]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const n = (v) => formatNumber(v, language);

  return (
    <div className="adm-stack">
      <div className="adm-filters">
        <label className="adm-field adm-field--grow">
          <span className="adm-field-label">{t('adm_users_search')}</span>
          <input type="search" className="adm-input" value={search} onChange={e => setSearch(e.target.value)}
                 placeholder={t('adm_users_search_ph')} maxLength={64} />
        </label>
        <label className="adm-field">
          <span className="adm-field-label">{t('adm_users_tier')}</span>
          <select className="adm-input" value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}>
            <option value="all">{t('adm_users_tier_all')}</option>
            {tiers.map(x => (
              <option key={x.id} value={x.is_default ? 'default' : String(x.id)}>
                {language === 'en' ? x.name_en : x.name_fr} ({formatNumber(x.users, language)})
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-field-label">{t('adm_users_sort')}</span>
          <select className="adm-input" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            {SORTS.map(s => <option key={s} value={s}>{t(`adm_sort_${s}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="adm-toolbar" role="group" aria-label={t('adm_users_filter')}>
        {STATUSES.map(s => (
          <button key={s} type="button" className="s-chip" data-active={status === s}
                  onClick={() => { setStatus(s); setPage(1); }}>
            {t(`adm_status_${s}`)}
          </button>
        ))}
        {data && <span className="adm-toolbar-note">{t('adm_users_count', { count: n(data.total) })}</span>}
        {loading && <Spinner size={12} />}
      </div>

      {error && <p className="st-note" data-tone="error">{error}</p>}
      {!data ? <div className="adm-loading"><Spinner size={18} /></div> : data.items.length === 0 ? (
        <p className="adm-empty">{t('adm_users_none')}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table--rows">
            <thead>
              <tr>
                <th>{t('adm_col_player')}</th>
                <th>{t('adm_col_email')}</th>
                <th className="num">{t('adm_col_games')}</th>
                <th className="num">Elo</th>
                <th className="num">{t('adm_col_credits')}</th>
                <th>{t('adm_col_signup')}</th>
                <th>{t('adm_col_last_login')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(u => (
                <tr key={u.id} data-off={!u.is_active || undefined}
                    onClick={() => goAdmin(`users/${u.id}`)}>
                  <td>
                    <a className="adm-user" href={`#/admin/users/${u.id}`} onClick={e => e.stopPropagation()}>
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="adm-avatar" /> :
                        <span className="adm-avatar adm-avatar--ph" aria-hidden="true">{u.display_name[0]?.toUpperCase()}</span>}
                      <span className="adm-user-name">{u.display_name}</span>
                    </a>
                    <span className="adm-badges">
                      <UserBadges user={u} t={t} />
                      <TierBadge tier={tiers.find(x => (u.tier_id == null ? x.is_default : x.id === u.tier_id))} />
                    </span>
                  </td>
                  <td className="adm-muted">{u.email}</td>
                  <td className="num">{n(u.games_played + u.mp_games)}</td>
                  <td className="num">{u.mp_games ? u.mp_rating : '—'}</td>
                  <td className="num">{n(u.credits)}</td>
                  <td className="adm-muted">{formatRelative(u.created_at, language)}</td>
                  <td className="adm-muted">{formatRelative(u.last_login_at, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <nav className="adm-pager" aria-label={t('adm_pages')}>
          <button type="button" className="s-chip" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← {t('adm_prev')}</button>
          <span className="adm-toolbar-note">{t('adm_page_of', { page, pages })}</span>
          <button type="button" className="s-chip" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>{t('adm_next')} →</button>
        </nav>
      )}
    </div>
  );
}
