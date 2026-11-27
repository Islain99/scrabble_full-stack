// src/components/admin/AdminMessaging.jsx
// Dashboard › Messagerie (lot A4) : signalements à traiter, joueurs muets, mode
// lent, et règles (salon universel, filtre de mots, liens, cadence, longueur).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  getChatAdmin, listReports, muteUser, resetChatRules, resolveReport, saveChatRules, setSlowMode,
} from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate, formatNumber, formatRelative } from './adminUtils';

const SLOW = [0, 10, 30, 60, 120];

function Reports({ t, language, onChanged }) {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => listReports().then(setReports).catch(err => setError(errorOf(err, t))), [t]);
  useEffect(() => {
    let cancelled = false;
    listReports().then(r => { if (!cancelled) setReports(r); }).catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const act = async (id, fn) => {
    setBusy(id); setError(null);
    try { await fn(); await load(); onChanged(); } catch (err) { setError(errorOf(err, t)); } finally { setBusy(null); }
  };

  return (
    <section className="adm-panel adm-stack" aria-labelledby="adm-reports">
      <div className="adm-set-head">
        <h3 id="adm-reports" className="adm-h3">{t('adm_msg_reports')}</h3>
        {reports && <span className="adm-hint">{t('adm_msg_reports_count', { count: reports.length })}</span>}
      </div>
      {error && <p className="st-note" data-tone="error">{error}</p>}
      {reports === null ? <Spinner size={16} /> : reports.length === 0 ? <p className="adm-empty">{t('adm_msg_no_reports')}</p> : (
        <ul className="adm-reports">
          {reports.map(r => (
            <li key={r.id} className="adm-report">
              <div className="adm-report-head">
                <a className="adm-link" href={`#/admin/users/${r.message.author_id}`}>{r.message.author_name}</a>
                <span className="adm-hint">
                  {t(r.conversation_kind === 'global' ? 'adm_msg_in_global' : 'adm_msg_in_other', { kind: r.conversation_kind })}
                  {' · '}{formatRelative(r.created_at, language)}
                  {' · '}{t('adm_msg_reported_by', { name: r.reporter_name, count: r.reports_count })}
                </span>
              </div>
              <blockquote className="adm-quote">{r.message.deleted ? t('adm_msg_deleted') : r.message.body}</blockquote>
              {r.reason && <p className="adm-hint">{t('adm_msg_reason', { reason: r.reason })}</p>}
              <div className="adm-actions">
                <RetroButton variant="danger" disabled={busy === r.id} onClick={() => act(r.id, () => resolveReport(r.id, 'delete'))}>
                  {t('adm_msg_delete')}
                </RetroButton>
                <RetroButton disabled={busy === r.id} onClick={() => act(r.id, async () => {
                  await resolveReport(r.id, 'delete');
                  await muteUser(r.message.author_id, 24 * 60);
                })}>
                  {t('adm_msg_delete_mute')}
                </RetroButton>
                <RetroButton disabled={busy === r.id} onClick={() => act(r.id, () => resolveReport(r.id, 'dismiss'))}>
                  {t('adm_msg_dismiss')}
                </RetroButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminMessaging() {
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [words, setWords] = useState('');          // mots ajoutés, un par ligne
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const apply = (d) => { setData(d); setDraft(d.rules); setWords(d.rules.extra_words.join('\n')); };
  const reload = useCallback(() => getChatAdmin().then(apply).catch(() => {}), []);
  useEffect(() => {
    let cancelled = false;
    getChatAdmin().then(d => { if (!cancelled) apply(d); }).catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const parsedWords = useMemo(() => words.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean), [words]);
  const full = draft ? { ...draft, extra_words: parsedWords } : null;
  const dirty = data && full && JSON.stringify(full) !== JSON.stringify(data.rules);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try { apply(await fn()); setNote(''); setConfirmReset(false); setNotice(t(doneKey)); }
    catch (err) { setError(errorOf(err, t)); }
    finally { setBusy(false); }
  };

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!data || !draft) return <div className="adm-loading"><Spinner size={18} /></div>;

  const n = (v) => formatNumber(v, language);
  const set = (k) => (v) => setDraft(d => ({ ...d, [k]: v }));
  const st = data.stats;

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_msg_24h')}</span><span className="adm-kpi-value">{n(st.messages_24h)}</span>
          <span className="adm-kpi-hint">{t('adm_msg_7d', { count: n(st.messages_7d) })}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_msg_global_7d')}</span><span className="adm-kpi-value">{n(st.global_7d)}</span>
          <span className="adm-kpi-hint">{t('adm_msg_authors', { count: n(st.authors_7d) })}</span></div>
        <div className="adm-kpi" data-tone={st.reports_pending ? 'alert' : undefined}><span className="adm-kpi-label">{t('adm_kpi_reports')}</span>
          <span className="adm-kpi-value">{n(st.reports_pending)}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_kpi_muted')}</span><span className="adm-kpi-value">{n(data.muted.length)}</span></div>
      </div>

      <Reports t={t} language={language} onChanged={reload} />

      <div className="adm-two">
        <section className="adm-panel adm-stack" aria-labelledby="adm-slow">
          <h3 id="adm-slow" className="adm-h3">{t('msg_slow_mode')}</h3>
          <p className="adm-hint">{t('adm_msg_slow_hint')}</p>
          <div className="adm-toolbar">
            {SLOW.map(s => (
              <button key={s} type="button" className="s-chip" data-active={data.slow_mode_s === s} disabled={busy}
                      onClick={async () => { await setSlowMode(s); reload(); }}>
                {s ? `${s} s` : t('rr_none')}
              </button>
            ))}
          </div>
        </section>
        <section className="adm-panel adm-stack" aria-labelledby="adm-muted">
          <h3 id="adm-muted" className="adm-h3">{t('adm_msg_muted_list')}</h3>
          {data.muted.length === 0 ? <p className="adm-empty">{t('adm_msg_none_muted')}</p> : (
            <ul className="adm-log">
              {data.muted.map(m => (
                <li key={m.id} className="adm-log-row">
                  <a className="adm-link" href={`#/admin/users/${m.id}`}>{m.display_name}</a>
                  <span className="adm-actions" style={{ alignItems: 'center' }}>
                    <span className="adm-hint">{t('adm_muted_until', { date: formatDate(m.until, language) })}</span>
                    <button type="button" className="s-chip" disabled={busy} onClick={async () => { await muteUser(m.id, 0); reload(); }}>
                      {t('adm_unmute')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <section className="adm-panel adm-stack" aria-labelledby="adm-chat-rules">
        <div className="adm-set-head">
          <h3 id="adm-chat-rules" className="adm-h3">{t('adm_msg_rules')}</h3>
          <span className="adm-hint">{data.custom
            ? t('adm_set_saved_by', { date: formatDate(data.updated_at, language), name: data.updated_by_name ?? '—' })
            : t('adm_msg_builtin')}</span>
        </div>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('msg_global')}</legend>
          <label className="adm-check">
            <input type="checkbox" checked={draft.global_enabled} onChange={e => set('global_enabled')(e.target.checked)} />
            {t('adm_msg_global_open')}
          </label>
          {!draft.global_enabled && <p className="adm-hint">{t('adm_msg_global_closed_hint')}</p>}
          <div className="adm-pp-row adm-pp-row--even">
            <label className="adm-field"><span className="adm-field-label">{t('adm_msg_rules_fr')}</span>
              <textarea className="adm-input adm-textarea" rows={3} maxLength={1500} value={draft.rules_fr}
                        onChange={e => set('rules_fr')(e.target.value)} placeholder={t('adm_msg_rules_ph')} /></label>
            <label className="adm-field"><span className="adm-field-label">{t('adm_msg_rules_en')}</span>
              <textarea className="adm-input adm-textarea" rows={3} maxLength={1500} value={draft.rules_en}
                        onChange={e => set('rules_en')(e.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_msg_filter')}</legend>
          <label className="adm-check">
            <input type="checkbox" checked={draft.builtin_words} onChange={e => set('builtin_words')(e.target.checked)} />
            {t('adm_msg_builtin_words', { count: data.builtin_words.length })}
          </label>
          <details className="adm-details">
            <summary className="adm-hint">{t('adm_msg_show_builtin')}</summary>
            <p className="adm-hint">{data.builtin_words.join(', ')}</p>
          </details>
          <label className="adm-field"><span className="adm-field-label">{t('adm_msg_extra_words')}</span>
            <textarea className="adm-input adm-textarea" rows={4} value={words} onChange={e => setWords(e.target.value)}
                      placeholder={t('adm_msg_extra_ph')} />
            <span className="adm-hint">{t('adm_msg_extra_hint', { count: parsedWords.length })}</span></label>
          <div className="adm-seg" role="radiogroup" aria-label={t('adm_msg_filter_mode')}>
            {['mask', 'block'].map(m => (
              <button key={m} type="button" role="radio" aria-checked={draft.filter_mode === m} className="adm-seg-btn"
                      onClick={() => set('filter_mode')(m)}>{t(`adm_msg_mode_${m}`)}</button>
            ))}
          </div>
          <p className="adm-hint">{t(`adm_msg_mode_${draft.filter_mode}_hint`)}</p>
        </fieldset>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_msg_links')}</legend>
          <div className="adm-seg" role="radiogroup" aria-label={t('adm_msg_links')}>
            {['all', 'new_accounts', 'none'].map(m => (
              <button key={m} type="button" role="radio" aria-checked={draft.links === m} className="adm-seg-btn"
                      onClick={() => set('links')(m)}>{t(`adm_msg_links_${m}`)}</button>
            ))}
          </div>
          {draft.links === 'new_accounts' && (
            <label className="adm-field adm-num"><span className="adm-field-label">{t('adm_msg_link_age')}</span>
              <input type="number" className="adm-input adm-input--sm" min={1} max={720} value={draft.link_min_age_hours}
                     onChange={e => set('link_min_age_hours')(Math.max(1, Math.min(720, Math.round(Number(e.target.value) || 1))))} /></label>
          )}
          <p className="adm-hint">{t('adm_msg_links_hint')}</p>
        </fieldset>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_msg_pace')}</legend>
          <div className="adm-nums">
            <label className="adm-field adm-num"><span className="adm-field-label">{t('adm_msg_max_length')}</span>
              <input type="number" className="adm-input adm-input--sm" min={20} max={500} value={draft.max_length}
                     onChange={e => set('max_length')(Math.max(20, Math.min(500, Math.round(Number(e.target.value) || 20))))} /></label>
            <label className="adm-field adm-num"><span className="adm-field-label">{t('adm_msg_interval')}</span>
              <input type="number" className="adm-input adm-input--sm" min={0} max={300} value={draft.min_interval_s}
                     onChange={e => set('min_interval_s')(Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0))))} /></label>
            <label className="adm-field adm-num"><span className="adm-field-label">{t('adm_msg_per_minute')}</span>
              <input type="number" className="adm-input adm-input--sm" min={1} max={120} value={draft.max_per_minute}
                     onChange={e => set('max_per_minute')(Math.max(1, Math.min(120, Math.round(Number(e.target.value) || 1))))} /></label>
          </div>
        </fieldset>
      </section>

      <div className="adm-panel adm-reset">
        {confirmReset ? (
          <>
            <p className="acc-text">{t('adm_msg_reset_confirm')}</p>
            <div className="adm-actions">
              <RetroButton variant="danger" disabled={busy} onClick={() => run(resetChatRules, 'adm_msg_reset_done')}>{t('adm_msg_reset')}</RetroButton>
              <RetroButton disabled={busy} onClick={() => setConfirmReset(false)}>{t('adm_cancel')}</RetroButton>
            </div>
          </>
        ) : (
          <div className="adm-actions">
            <RetroButton disabled={busy || !data.custom} onClick={() => setConfirmReset(true)}>{t('adm_msg_reset')}</RetroButton>
            <span className="adm-hint">{t('adm_msg_reset_hint')}</span>
          </div>
        )}
      </div>

      {dirty && (
        <div className="adm-savebar" role="region" aria-label={t('adm_msg_unsaved')}>
          <span className="adm-savebar-text">{t('adm_msg_unsaved')}</span>
          <input className="adm-input adm-input--sm" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          <RetroButton disabled={busy} onClick={() => apply(data)}>{t('adm_cancel')}</RetroButton>
          <RetroButton variant="primary" disabled={busy} onClick={() => run(() => saveChatRules(full, note.trim()), 'adm_msg_saved')}>
            {t('adm_save')}
          </RetroButton>
        </div>
      )}
    </div>
  );
}
