// src/components/admin/AdminCredits.jsx
// Dashboard › Crédits (lot A3) : chiffres (en circulation, gagnés, dépensés),
// règles (gains, plafond, prix des indices, palettes premium) et grand livre.
// L'ajustement du solde d'un joueur se fait depuis sa fiche.

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useEconomy } from '../../context/EconomyContext';
import { getAllTransactions, getEconomyAdmin, resetEconomyRules, saveEconomyRules } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate, formatNumber } from './adminUtils';

const DIFFS = ['beginner', 'easy', 'medium', 'hard_minus', 'hard'];
const PALETTES = ['vintage', 'classique', 'ocean', 'bordeaux', 'ardoise', 'lavande', 'foret', 'terracotta', 'tournesol', 'contraste'];
const KINDS = ['signup', 'daily', 'solo_win', 'mp_win', 'mp_draw', 'mp_loss', 'hint', 'unlock', 'admin_grant', 'admin_debit'];
const PAGE = 50;

function Num({ label, value, onChange, hint, max = 100000 }) {
  return (
    <label className="adm-field adm-num">
      <span className="adm-field-label">{label}</span>
      <input type="number" className="adm-input adm-input--sm" min={0} max={max} step={1} value={value}
             onChange={e => onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
      {hint && <span className="adm-hint">{hint}</span>}
    </label>
  );
}

function Ledger({ t, language }) {
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllTransactions({ kind: kind || null, limit: PAGE })
      .then(r => { if (!cancelled) { setRows(r); setMore(r.length === PAGE); } })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [kind]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await getAllTransactions({ kind: kind || null, limit: PAGE, beforeId: rows[rows.length - 1].id });
      setRows(prev => [...prev, ...r]);
      setMore(r.length === PAGE);
    } finally { setBusy(false); }
  };

  return (
    <section className="adm-panel adm-stack">
      <div className="adm-set-head">
        <h3 className="adm-h3">{t('adm_cr_ledger')}</h3>
        <select className="adm-input adm-input--sm" value={kind} onChange={e => { setRows(null); setKind(e.target.value); }}
                aria-label={t('adm_cr_kind_filter')}>
          <option value="">{t('adm_cr_all_kinds')}</option>
          {KINDS.map(k => <option key={k} value={k}>{t(`eco_kind_${k}`)}</option>)}
        </select>
      </div>
      {rows === null ? <Spinner size={16} /> : rows.length === 0 ? <p className="adm-empty">{t('adm_cr_none')}</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr>
              <th>{t('adm_col_date')}</th><th>{t('adm_col_player')}</th><th>{t('adm_cr_col_kind')}</th>
              <th className="num">{t('adm_cr_col_amount')}</th><th className="num">{t('adm_cr_col_after')}</th><th>{t('adm_cr_col_note')}</th>
            </tr></thead>
            <tbody>
              {rows.map(tx => (
                <tr key={tx.id}>
                  <td className="adm-muted">{formatDate(tx.created_at, language)}</td>
                  <td><a className="adm-link" href={`#/admin/users/${tx.user_id}`}>{tx.user_name ?? `#${tx.user_id}`}</a></td>
                  <td>{t(`eco_kind_${tx.kind}`)}</td>
                  <td className="num" data-sign={tx.amount > 0 ? '+' : tx.amount < 0 ? '-' : '0'}>{tx.amount > 0 ? '+' : ''}{formatNumber(tx.amount, language)}</td>
                  <td className="num">{formatNumber(tx.balance_after, language)}</td>
                  <td className="adm-muted">{[tx.note, tx.admin_name && t('adm_cr_by', { name: tx.admin_name })].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && <div className="adm-actions"><RetroButton disabled={busy} onClick={loadMore}>{t('adm_load_more')}</RetroButton></div>}
    </section>
  );
}

export default function AdminCredits() {
  const { t, language } = useLanguage();
  const { reloadPublic } = useEconomy();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEconomyAdmin()
      .then(d => { if (!cancelled) { setData(d); setDraft(d.rules); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const dirty = useMemo(() => data && draft && JSON.stringify(draft) !== JSON.stringify(data.rules), [data, draft]);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const d = await fn();
      setData(d); setDraft(d.rules); setNote(''); setConfirmReset(false);
      setNotice(d.kept_unlocks ? `${t(doneKey)} ${t('adm_cr_kept', { count: d.kept_unlocks })}` : t(doneKey));
      reloadPublic();
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!data || !draft) return <div className="adm-loading"><Spinner size={18} /></div>;

  const n = (v) => formatNumber(v, language);
  const set = (k) => (v) => setDraft(d => ({ ...d, [k]: v }));
  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const st = data.stats;
  const togglePremium = (p) => setDraft(d => {
    const next = { ...d.premium_palettes };
    if (p in next) delete next[p]; else next[p] = 100;
    return { ...d, premium_palettes: next };
  });
  const premiumCount = Object.keys(draft.premium_palettes).length;

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_cr_circulation')}</span>
          <span className="adm-kpi-value">🪙 {n(st.circulation)}</span>
          <span className="adm-kpi-hint">{t('adm_cr_holders', { count: n(st.holders) })}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_cr_earned')}</span>
          <span className="adm-kpi-value">+{n(sum(st.earned_30d))}</span>
          <span className="adm-kpi-hint">{t('adm_cr_30d')}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_cr_spent')}</span>
          <span className="adm-kpi-value">−{n(sum(st.spent_30d))}</span>
          <span className="adm-kpi-hint">{t('adm_cr_hints', { count: n(st.hints_30d) })}</span></div>
        <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_cr_unlocks')}</span>
          <span className="adm-kpi-value">{n(sum(st.palette_unlocks))}</span>
          <span className="adm-kpi-hint">{Object.entries(st.palette_unlocks).map(([p, c]) => `${t(`palette_${p}`)} ${c}`).join(' · ') || '—'}</span></div>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <section className="adm-panel adm-stack">
        <div className="adm-set-head">
          <h3 className="adm-h3">{t('adm_cr_rules')}</h3>
          <span className="adm-hint">
            {data.custom ? t('adm_set_saved_by', { date: formatDate(data.updated_at, language), name: data.updated_by_name ?? '—' })
              : t('adm_cr_builtin')}
          </span>
        </div>
        <label className="adm-check">
          <input type="checkbox" checked={draft.enabled} onChange={e => set('enabled')(e.target.checked)} />
          {t('adm_cr_enabled')}
        </label>
        {!draft.enabled && <p className="adm-hint">{t('adm_cr_disabled_hint')}</p>}

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_cr_earn')}</legend>
          <div className="adm-nums">
            <Num label={t('adm_cr_signup')} value={draft.signup_bonus} onChange={set('signup_bonus')} />
            <Num label={t('adm_cr_daily')} value={draft.daily_login} onChange={set('daily_login')} />
            <Num label={t('adm_cr_mp_win')} value={draft.mp_win} onChange={set('mp_win')} />
            <Num label={t('adm_cr_mp_draw')} value={draft.mp_draw} onChange={set('mp_draw')} />
            <Num label={t('adm_cr_mp_loss')} value={draft.mp_loss} onChange={set('mp_loss')} />
            <Num label={t('adm_cr_cap')} value={draft.daily_game_cap} max={1000000} onChange={set('daily_game_cap')} hint={t('adm_cr_cap_hint')} />
          </div>
          <span className="adm-field-label">{t('adm_cr_solo_win')}</span>
          <div className="adm-nums">
            {DIFFS.map(d => (
              <Num key={d} label={t(`diff_${d}_label`)} value={draft.solo_win[d]}
                   onChange={v => setDraft(x => ({ ...x, solo_win: { ...x.solo_win, [d]: v } }))} />
            ))}
          </div>
          <p className="adm-hint">{t('adm_cr_solo_hint')}</p>
        </fieldset>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_cr_hints_title')}</legend>
          <div className="adm-nums">
            <Num label={t('adm_cr_hint_price')} value={draft.hint_price} onChange={set('hint_price')} hint={t('adm_cr_zero_free')} />
            <Num label={t('adm_cr_hints_per_game')} value={draft.hints_per_game} max={100} onChange={set('hints_per_game')} hint={t('adm_cr_zero_unlimited')} />
          </div>
        </fieldset>

        <fieldset className="adm-fieldset">
          <legend className="adm-field-label">{t('adm_cr_premium')}</legend>
          <p className="adm-hint">{t('adm_cr_premium_hint')}</p>
          <div className="adm-premium">
            {PALETTES.map(p => {
              const on = p in draft.premium_palettes;
              const last = !on && premiumCount >= PALETTES.length - 1;
              return (
                <div key={p} className="adm-premium-row" data-on={on || undefined}>
                  <label className="adm-check">
                    <input type="checkbox" checked={on} disabled={last} onChange={() => togglePremium(p)} />
                    {t(`palette_${p}`)}
                  </label>
                  {on ? (
                    <input type="number" className="adm-input adm-input--sm" min={1} max={100000} value={draft.premium_palettes[p]}
                           aria-label={t('adm_cr_price_of', { name: t(`palette_${p}`) })}
                           onChange={e => setDraft(d => ({ ...d, premium_palettes: { ...d.premium_palettes, [p]: Math.max(1, Math.round(Number(e.target.value) || 1)) } }))} />
                  ) : <span className="adm-muted">{t('eco_free')}</span>}
                  {st.palette_unlocks[p] ? <span className="adm-hint">{t('adm_cr_unlocked_by', { count: st.palette_unlocks[p] })}</span> : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      </section>

      <Ledger t={t} language={language} />

      <div className="adm-panel adm-reset">
        {confirmReset ? (
          <>
            <p className="acc-text">{t('adm_cr_reset_confirm')}</p>
            <div className="adm-actions">
              <RetroButton variant="danger" disabled={busy} onClick={() => run(resetEconomyRules, 'adm_cr_reset_done')}>{t('adm_cr_reset')}</RetroButton>
              <RetroButton disabled={busy} onClick={() => setConfirmReset(false)}>{t('adm_cancel')}</RetroButton>
            </div>
          </>
        ) : (
          <div className="adm-actions">
            <RetroButton disabled={busy || !data.custom} onClick={() => setConfirmReset(true)}>{t('adm_cr_reset')}</RetroButton>
            <span className="adm-hint">{t('adm_cr_reset_hint')}</span>
          </div>
        )}
      </div>

      {dirty && (
        <div className="adm-savebar" role="region" aria-label={t('adm_cr_unsaved')}>
          <span className="adm-savebar-text">{t('adm_cr_unsaved')}</span>
          <input className="adm-input adm-input--sm" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          <RetroButton disabled={busy} onClick={() => { setDraft(data.rules); setNotice(null); }}>{t('adm_cancel')}</RetroButton>
          <RetroButton variant="primary" disabled={busy} onClick={() => run(() => saveEconomyRules(draft, note.trim()), 'adm_cr_saved')}>
            {t('adm_save')}
          </RetroButton>
        </div>
      )}
    </div>
  );
}
