// src/components/admin/AdminPublications.jsx
// Dashboard › Notifications et publications (lot A4) : annonces FR/EN pour tous
// les joueurs ou certains niveaux d'abonnement, montrées dans un bandeau et/ou
// envoyées en notification (cloche + push), avec dates de début et de fin.
// Cycle : brouillon → publiée → retirée. La notification part à la première publication.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  archiveAnnouncement, createAnnouncement, deleteAnnouncement, getAdminTiers, listAnnouncementsAdmin,
  publishAnnouncement, updateAnnouncement,
} from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate, formatNumber } from './adminUtils';

const KINDS = ['info', 'event', 'update', 'maintenance', 'promo'];
const ICONS = { info: 'ℹ️', event: '🎉', update: '✨', maintenance: '🛠️', promo: '🎁' };
const FILTERS = ['all', 'draft', 'published', 'archived'];
const EMPTY = {
  title_fr: '', title_en: '', body_fr: '', body_en: '', kind: 'info', link: '',
  audience_tiers: null, show_banner: true, notify: false, starts_at: '', ends_at: '',
};

// datetime-local (heure locale) ⇄ ISO
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toIso = (local) => (local ? new Date(local).toISOString() : null);

function Editor({ initial, tiers, onSave, onCancel, busy, t, language }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const everyone = form.audience_tiers === null;
  const toggleTier = (id) => setForm(f => {
    const cur = new Set(f.audience_tiers ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    return { ...f, audience_tiers: [...cur] };
  });
  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...form, link: form.link.trim() || null,
      starts_at: toIso(form.starts_at), ends_at: toIso(form.ends_at),
    });
  };
  const name = (tier) => (language === 'en' ? tier.name_en : tier.name_fr);

  return (
    <form className="adm-stack adm-ann-form" onSubmit={submit}>
      <div className="adm-pp-row adm-pp-row--even">
        <label className="adm-field"><span className="adm-field-label">{t('adm_ann_title_fr')}</span>
          <input className="adm-input" value={form.title_fr} maxLength={120} required onChange={set('title_fr')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_ann_title_en')}</span>
          <input className="adm-input" value={form.title_en} maxLength={120} required onChange={set('title_en')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_ann_body_fr')}</span>
          <textarea className="adm-input adm-textarea" rows={3} maxLength={2000} value={form.body_fr} onChange={set('body_fr')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_ann_body_en')}</span>
          <textarea className="adm-input adm-textarea" rows={3} maxLength={2000} value={form.body_en} onChange={set('body_en')} /></label>
      </div>

      <div className="adm-filters">
        <label className="adm-field"><span className="adm-field-label">{t('adm_ann_kind')}</span>
          <select className="adm-input" value={form.kind} onChange={set('kind')}>
            {KINDS.map(k => <option key={k} value={k}>{ICONS[k]} {t(`adm_ann_kind_${k}`)}</option>)}
          </select></label>
        <label className="adm-field adm-field--grow"><span className="adm-field-label">{t('adm_ann_link')}</span>
          <input className="adm-input" value={form.link ?? ''} maxLength={300} onChange={set('link')} placeholder="#/multiplayer · https://…" /></label>
      </div>

      <fieldset className="adm-fieldset">
        <legend className="adm-field-label">{t('adm_ann_audience')}</legend>
        <div className="adm-seg" role="radiogroup" aria-label={t('adm_ann_audience')}>
          <button type="button" role="radio" aria-checked={everyone} className="adm-seg-btn"
                  onClick={() => setForm(f => ({ ...f, audience_tiers: null }))}>{t('adm_ann_everyone')}</button>
          <button type="button" role="radio" aria-checked={!everyone} className="adm-seg-btn"
                  onClick={() => setForm(f => ({ ...f, audience_tiers: f.audience_tiers ?? [] }))}>{t('adm_ann_some_tiers')}</button>
        </div>
        {everyone ? <p className="adm-hint">{t('adm_ann_everyone_hint')}</p> : (
          <div className="adm-actions">
            {tiers.map(x => (
              <label key={x.id} className="adm-check">
                <input type="checkbox" checked={form.audience_tiers.includes(x.id)} onChange={() => toggleTier(x.id)} />
                {name(x)} {x.badge} <span className="adm-hint">({formatNumber(x.users, language)})</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend className="adm-field-label">{t('adm_ann_delivery')}</legend>
        <label className="adm-check"><input type="checkbox" checked={form.show_banner} onChange={set('show_banner')} />{t('adm_ann_banner')}</label>
        <label className="adm-check"><input type="checkbox" checked={form.notify} onChange={set('notify')} />{t('adm_ann_notify')}</label>
        <p className="adm-hint">{t('adm_ann_notify_hint')}</p>
        <div className="adm-filters">
          <label className="adm-field"><span className="adm-field-label">{t('adm_ann_starts')}</span>
            <input type="datetime-local" className="adm-input" value={form.starts_at} onChange={set('starts_at')} /></label>
          <label className="adm-field"><span className="adm-field-label">{t('adm_ann_ends')}</span>
            <input type="datetime-local" className="adm-input" value={form.ends_at} onChange={set('ends_at')} /></label>
        </div>
        <p className="adm-hint">{t('adm_ann_dates_hint')}</p>
      </fieldset>

      <div className="adm-actions" style={{ justifyContent: 'flex-end' }}>
        <RetroButton disabled={busy} onClick={onCancel}>{t('adm_cancel')}</RetroButton>
        <RetroButton type="submit" variant="primary" disabled={busy || (!form.show_banner && !form.notify)
          || (!everyone && form.audience_tiers.length === 0)}>
          {t('adm_ann_save_draft')}
        </RetroButton>
      </div>
    </form>
  );
}

const toForm = (a) => ({
  ...EMPTY, ...a, link: a.link ?? '', starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at),
});

export default function AdminPublications() {
  const { t, language } = useLanguage();
  const [page, setPage] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);     // { id?: number, form }
  const [confirm, setConfirm] = useState(null);     // { id, action }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = (f = filter) => listAnnouncementsAdmin(f === 'all' ? null : f).then(setPage);
  useEffect(() => {
    let cancelled = false;
    listAnnouncementsAdmin(filter === 'all' ? null : filter)
      .then(p => { if (!cancelled) setPage(p); })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [filter, t]);
  useEffect(() => {
    let cancelled = false;
    getAdminTiers().then(list => { if (!cancelled) setTiers(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const run = async (fn, doneKey, extra = '') => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fn();
      await load();
      setEditing(null); setConfirm(null);
      setNotice(`${t(doneKey)}${extra && res ? extra(res) : ''}`);
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (error && !page) return <p className="st-note" data-tone="error">{error}</p>;
  if (!page) return <div className="adm-loading"><Spinner size={18} /></div>;

  const n = (v) => formatNumber(v, language);
  const devices = Object.values(page.devices).reduce((a, b) => a + b, 0);
  const audience = (a) => (a.audience_tiers === null ? t('adm_ann_everyone')
    : a.audience_tiers.map(id => { const x = tiers.find(y => y.id === id); return x ? (language === 'en' ? x.name_en : x.name_fr) : `#${id}`; }).join(', '));
  const state = (a) => (a.status === 'published' ? (a.live ? 'live' : (a.ends_at && new Date(a.ends_at) <= new Date() ? 'ended' : 'scheduled')) : a.status);

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_ann_live')}</span>
          <span className="adm-kpi-value">{n(page.items.filter(a => a.live).length)}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_ann_devices')}</span>
          <span className="adm-kpi-value">{n(devices)}</span>
          <span className="adm-kpi-hint">{Object.entries(page.devices).map(([p, c]) => `${p} ${c}`).join(' · ') || '—'}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_ann_opt_out')}</span>
          <span className="adm-kpi-value">{n(page.news_opt_out)}</span>
          <span className="adm-kpi-hint">{t('adm_ann_opt_out_hint')}</span></div>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      {editing ? (
        <section className="adm-panel">
          <h3 className="adm-h3">{editing.id ? t('adm_ann_edit') : t('adm_ann_new')}</h3>
          <Editor initial={editing.form} tiers={tiers} busy={busy} t={t} language={language}
                  onCancel={() => setEditing(null)}
                  onSave={form => run(() => (editing.id ? updateAnnouncement(editing.id, form) : createAnnouncement(form)), 'adm_ann_saved')} />
        </section>
      ) : (
        <div className="adm-actions">
          <RetroButton variant="primary" onClick={() => setEditing({ form: EMPTY })}>+ {t('adm_ann_new')}</RetroButton>
        </div>
      )}

      <div className="adm-toolbar">
        {FILTERS.map(f => (
          <button key={f} type="button" className="s-chip" data-active={filter === f} onClick={() => setFilter(f)}>
            {t(`adm_ann_filter_${f}`)}
          </button>
        ))}
      </div>

      {page.items.length === 0 ? <p className="adm-empty">{t('adm_ann_none')}</p> : (
        <div className="adm-anns">
          {page.items.map(a => (
            <article key={a.id} className="adm-panel adm-ann" data-state={state(a)}>
              <header className="adm-ann-head">
                <span className="adm-ann-icon" aria-hidden="true">{ICONS[a.kind]}</span>
                <div className="adm-tier-title">
                  <h3 className="adm-h2 adm-tier-name">{language === 'en' ? a.title_en : a.title_fr}</h3>
                  <span className="adm-hint">{language === 'en' ? a.title_fr : a.title_en}</span>
                </div>
                <span className="adm-ann-state">{t(`adm_ann_state_${state(a)}`)}</span>
              </header>
              {(language === 'en' ? a.body_en : a.body_fr) && <p className="acc-text adm-ann-body">{language === 'en' ? a.body_en : a.body_fr}</p>}
              <dl className="adm-kvs">
                <div className="adm-kv"><dt>{t('adm_ann_audience')}</dt><dd>{audience(a)}</dd></div>
                <div className="adm-kv"><dt>{t('adm_ann_delivery')}</dt><dd>
                  {[a.show_banner && t('adm_ann_banner_short'), a.notify && (a.notified_count
                    ? t('adm_ann_notified', { count: n(a.notified_count) }) : t('adm_ann_notify_short'))].filter(Boolean).join(' · ')}
                </dd></div>
                <div className="adm-kv"><dt>{t('adm_ann_period')}</dt><dd>
                  {a.starts_at ? formatDate(a.starts_at, language) : t('adm_ann_now')} → {a.ends_at ? formatDate(a.ends_at, language) : t('adm_ann_no_end')}
                </dd></div>
                {a.link && <div className="adm-kv"><dt>{t('adm_ann_link')}</dt><dd>{a.link}</dd></div>}
                <div className="adm-kv"><dt>{t('adm_ann_by')}</dt><dd>{a.created_by_name ?? '—'} · {formatDate(a.created_at, language)}</dd></div>
              </dl>
              {confirm?.id === a.id ? (
                <div className="adm-confirm">
                  <p className="acc-text">{t(`adm_ann_confirm_${confirm.action}`)}</p>
                  {confirm.action === 'publish' && a.notify && !a.notified_count && (
                    <p className="adm-hint">{t('adm_ann_confirm_notify', { audience: audience(a) })}</p>
                  )}
                  <div className="adm-actions">
                    <RetroButton variant={confirm.action === 'publish' ? 'primary' : 'danger'} disabled={busy}
                      onClick={() => run(
                        () => ({ publish: publishAnnouncement, archive: archiveAnnouncement, delete: deleteAnnouncement })[confirm.action](a.id),
                        `adm_ann_done_${confirm.action}`,
                        confirm.action === 'publish' ? (res => (res.notified_count ? ` ${t('adm_ann_notified', { count: n(res.notified_count) })}` : '')) : '',
                      )}>
                      {t(`adm_ann_${confirm.action}`)}
                    </RetroButton>
                    <RetroButton disabled={busy} onClick={() => setConfirm(null)}>{t('adm_cancel')}</RetroButton>
                  </div>
                </div>
              ) : (
                <div className="adm-actions">
                  {a.status !== 'published' && a.status !== 'archived' && (
                    <RetroButton variant="primary" disabled={busy} onClick={() => setConfirm({ id: a.id, action: 'publish' })}>{t('adm_ann_publish')}</RetroButton>
                  )}
                  {a.status !== 'archived' && (
                    <RetroButton disabled={busy} onClick={() => setEditing({ id: a.id, form: toForm(a) })}>{t('adm_ann_edit_btn')}</RetroButton>
                  )}
                  <RetroButton disabled={busy} onClick={() => setEditing({ form: { ...toForm(a), starts_at: '', ends_at: '' } })}>{t('adm_ann_duplicate')}</RetroButton>
                  {a.status === 'published' && (
                    <RetroButton variant="danger" disabled={busy} onClick={() => setConfirm({ id: a.id, action: 'archive' })}>{t('adm_ann_archive')}</RetroButton>
                  )}
                  {a.status !== 'published' && (
                    <RetroButton variant="danger" disabled={busy} onClick={() => setConfirm({ id: a.id, action: 'delete' })}>{t('adm_ann_delete')}</RetroButton>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
