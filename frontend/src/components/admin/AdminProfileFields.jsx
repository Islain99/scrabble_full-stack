// src/components/admin/AdminProfileFields.jsx
// Dashboard › Profil (lot A4) : pour chaque champ du profil, s'il est exigé,
// facultatif ou plus demandé, et s'il est montré aux autres joueurs ; âge minimal.
// Enregistrer recalcule le statut « profil complet » de tous les comptes.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getProfileFields, resetProfileFields, saveProfileFields } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate, formatNumber } from './adminUtils';

const COLLECT = ['required', 'optional', 'off'];
const LABELS = {
  first_name: 'field_firstname', last_name: 'field_lastname', age: 'field_age',
  country: 'field_country', bio: 'field_bio', avatar_url: 'field_avatar',
};

export default function AdminProfileFields() {
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfileFields().then(d => { if (!cancelled) { setData(d); setDraft(d.rules); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const d = await fn();
      setData(d); setDraft(d.rules); setNote(''); setConfirmReset(false);
      const r = d.recomputed ?? {};
      setNotice(`${t(doneKey)} ${t('adm_pf_recomputed', { complete: r.became_complete ?? 0, incomplete: r.became_incomplete ?? 0 })}`);
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!data || !draft) return <div className="adm-loading"><Spinner size={18} /></div>;

  const n = (v) => formatNumber(v, language);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.rules);
  const setField = (name, patch) => setDraft(d => {
    const next = { ...d.fields[name], ...patch };
    if (next.collect === 'off') next.public = false;
    return { ...d, fields: { ...d.fields, [name]: next } };
  });
  const pct = (v) => (data.stats.total ? Math.round(v / data.stats.total * 100) : 0);

  return (
    <div className="adm-stack">
      <div className="adm-panel adm-intro">
        <p className="acc-text">{t('adm_pf_intro')}</p>
        <p className="adm-hint">{t('adm_pf_privacy_note')}</p>
        <p className="adm-hint">
          {t('adm_pf_complete', { count: n(data.stats.complete), total: n(data.stats.total), pct: pct(data.stats.complete) })}
          {' · '}
          {data.custom ? t('adm_set_saved_by', { date: formatDate(data.updated_at, language), name: data.updated_by_name ?? '—' })
            : t('adm_pf_builtin')}
        </p>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <section className="adm-panel">
        <div className="adm-table-wrap adm-table-wrap--flat">
          <table className="adm-table adm-set-table adm-pf-table">
            <thead>
              <tr>
                <th>{t('adm_pf_field')}</th>
                <th>{t('adm_pf_collect')}</th>
                <th>{t('adm_pf_public')}</th>
                <th className="num">{t('adm_pf_filled')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="adm-set-name">{t('field_username')}</th>
                <td><span className="adm-hint">{t('adm_pf_always')}</span></td>
                <td><span className="adm-hint">{t('adm_yes')}</span></td>
                <td className="num">{n(data.stats.total)}</td>
              </tr>
              {data.fields.map(f => {
                const rule = draft.fields[f.name];
                return (
                  <tr key={f.name} data-mode={rule.collect === 'off' ? 'hidden' : rule.collect === 'required' ? 'locked' : 'free'}>
                    <th scope="row" className="adm-set-name">{t(LABELS[f.name])}</th>
                    <td>
                      <div className="adm-seg" role="radiogroup" aria-label={t('adm_pf_collect')}>
                        {COLLECT.map(c => (
                          <button key={c} type="button" role="radio" aria-checked={rule.collect === c} className="adm-seg-btn"
                                  data-mode={c === 'required' ? 'locked' : c === 'off' ? 'hidden' : 'free'}
                                  onClick={() => setField(f.name, { collect: c })}>
                            {t(`adm_pf_${c}`)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      {f.can_be_public ? (
                        <label className="adm-check">
                          <input type="checkbox" checked={rule.public} disabled={rule.collect === 'off'}
                                 onChange={e => setField(f.name, { public: e.target.checked })} />
                          {t('adm_pf_shown')}
                        </label>
                      ) : <span className="adm-hint">{t('adm_pf_never')}</span>}
                    </td>
                    <td className="num">{n(data.stats.filled[f.name])} <span className="adm-hint">({pct(data.stats.filled[f.name])} %)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="adm-nums" style={{ marginTop: 14 }}>
          <label className="adm-field adm-num"><span className="adm-field-label">{t('adm_pf_min_age')}</span>
            <input type="number" className="adm-input adm-input--sm" min={5} max={18} value={draft.min_age}
                   onChange={e => setDraft(d => ({ ...d, min_age: Math.max(5, Math.min(18, Math.round(Number(e.target.value) || 5))) }))} />
          </label>
        </div>
        <p className="adm-hint">{t('adm_pf_hint')}</p>
      </section>

      <div className="adm-panel adm-reset">
        {confirmReset ? (
          <>
            <p className="acc-text">{t('adm_pf_reset_confirm')}</p>
            <div className="adm-actions">
              <RetroButton variant="danger" disabled={busy} onClick={() => run(resetProfileFields, 'adm_pf_reset_done')}>{t('adm_pf_reset')}</RetroButton>
              <RetroButton disabled={busy} onClick={() => setConfirmReset(false)}>{t('adm_cancel')}</RetroButton>
            </div>
          </>
        ) : (
          <div className="adm-actions">
            <RetroButton disabled={busy || !data.custom} onClick={() => setConfirmReset(true)}>{t('adm_pf_reset')}</RetroButton>
            <span className="adm-hint">{t('adm_pf_reset_hint')}</span>
          </div>
        )}
      </div>

      {dirty && (
        <div className="adm-savebar" role="region" aria-label={t('adm_pf_unsaved')}>
          <span className="adm-savebar-text">{t('adm_pf_unsaved')}</span>
          <input className="adm-input adm-input--sm" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          <RetroButton disabled={busy} onClick={() => setDraft(data.rules)}>{t('adm_cancel')}</RetroButton>
          <RetroButton variant="primary" disabled={busy} onClick={() => run(() => saveProfileFields(draft, note.trim()), 'adm_pf_saved')}>
            {t('adm_save')}
          </RetroButton>
        </div>
      )}
    </div>
  );
}
