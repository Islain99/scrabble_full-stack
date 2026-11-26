// src/components/admin/AdminSettings.jsx
// Dashboard › Paramètres (lot A2) : pour chaque réglage des joueurs, l'état
// (libre, verrouillé, masqué), la valeur par défaut et les options proposées.
// Les modifications s'accumulent dans un brouillon, enregistré d'un coup.

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { getSettingsPolicy, resetSettingsPolicy, saveSettingsPolicy } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate } from './adminUtils';
import { optionLabel, settingLabel } from './settingsLabels';

const SECTIONS = ['appearance', 'game', 'display', 'behavior', 'notifications', 'privacy'];
const MODES = ['free', 'locked', 'hidden'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function SettingRow({ item, rule, onChange, t }) {
  const forced = rule.mode !== 'free';
  const isChoice = item.type === 'choice';
  // themeMode / colorPalette : « aucun défaut » possible tant que le réglage est libre
  const canBeEmpty = isChoice && item.origin === null && !forced;
  const defaults = isChoice ? [...(canBeEmpty ? [null] : []), ...rule.options] : [true, false];
  const changed = (patch) => onChange({ ...rule, ...patch });

  const setMode = (mode) => {
    // Verrouiller sans défaut : la première option proposée devient le défaut
    if (mode !== 'free' && rule.default === null) changed({ mode, default: rule.options?.[0] ?? null });
    else changed({ mode });
  };

  const toggleOption = (value) => {
    const on = rule.options.includes(value);
    if (on && (rule.options.length === 1 || value === rule.default)) return;   // garder le défaut et au moins une option
    const options = item.options.filter(o => (o === value ? !on : rule.options.includes(o)));
    changed({ options });
  };

  return (
    <tr data-mode={rule.mode}>
      <th scope="row" className="adm-set-name">{settingLabel(item.key, t)}</th>
      <td>
        <div className="adm-seg" role="radiogroup" aria-label={t('adm_set_col_mode')}>
          {MODES.map(m => (
            <button key={m} type="button" role="radio" aria-checked={rule.mode === m}
                    className="adm-seg-btn" data-mode={m}
                    disabled={!item.lockable && m !== 'free'}
                    title={!item.lockable && m !== 'free' ? t('adm_set_not_lockable') : t(`adm_set_mode_${m}_hint`)}
                    onClick={() => setMode(m)}>
              {t(`adm_set_mode_${m}`)}
            </button>
          ))}
        </div>
      </td>
      <td>
        <select className="adm-input adm-input--sm" aria-label={t('adm_set_col_default')}
                value={JSON.stringify(rule.default)}
                onChange={e => changed({ default: JSON.parse(e.target.value) })}>
          {defaults.map(v => (
            <option key={JSON.stringify(v)} value={JSON.stringify(v)}>{optionLabel(item.key, v, t)}</option>
          ))}
        </select>
      </td>
      <td>
        {isChoice ? (
          <div className="adm-opts" aria-label={t('adm_set_col_options')}>
            {item.options.map(o => {
              const on = rule.options.includes(o);
              const locked = on && (o === rule.default || rule.options.length === 1);
              return (
                <label key={String(o)} className="adm-opt" data-on={on || undefined} data-disabled={(forced || locked) || undefined}
                       title={locked ? t('adm_set_option_default') : undefined}>
                  <input type="checkbox" checked={on} disabled={forced || locked} onChange={() => toggleOption(o)} />
                  {optionLabel(item.key, o, t)}
                </label>
              );
            })}
          </div>
        ) : <span className="adm-muted">—</span>}
      </td>
    </tr>
  );
}

export default function AdminSettings() {
  const { t, language } = useLanguage();
  const { reload } = useAppConfig();
  const [data, setData] = useState(null);           // réponse du serveur
  const [draft, setDraft] = useState(null);         // politique en cours d'édition
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettingsPolicy()
      .then(d => { if (!cancelled) { setData(d); setDraft(d.policy); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const dirtyKeys = useMemo(
    () => (data && draft ? Object.keys(draft).filter(k => !same(draft[k], data.policy[k])) : []),
    [data, draft],
  );

  const afterSave = (d, doneText) => {
    setData(d); setDraft(d.policy); setNote(''); setConfirmReset(false);
    const updates = Object.entries(d.privacy_updates ?? {});
    setNotice(updates.length
      ? `${doneText} ${t('adm_set_privacy_updates', { list: updates.map(([k, n]) => `${settingLabel(k, t)} (${n})`).join(', ') })}`
      : doneText);
    reload(true);                                    // l'interface de l'admin suit aussi
  };

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try { afterSave(await fn(), t(doneKey)); } catch (err) { setError(errorOf(err, t)); } finally { setBusy(false); }
  };

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!data || !draft) return <div className="adm-loading"><Spinner size={18} /></div>;

  const bySection = (section) => data.catalog.filter(c => c.section === section);
  const summary = (section) => {
    const items = bySection(section);
    const locked = items.filter(c => draft[c.key].mode !== 'free').length;
    return locked ? t('adm_set_section_fixed', { count: locked }) : t('adm_set_section_free');
  };

  return (
    <div className="adm-stack adm-settings">
      <div className="adm-panel adm-intro">
        <p className="acc-text">{t('adm_set_intro')}</p>
        <ul className="adm-legend">
          {MODES.map(m => <li key={m}><strong>{t(`adm_set_mode_${m}`)}</strong> — {t(`adm_set_mode_${m}_hint`)}</li>)}
        </ul>
        <p className="adm-hint">
          {data.custom
            ? t('adm_set_saved_by', { date: formatDate(data.updated_at, language), name: data.updated_by_name ?? '—' })
            : t('adm_set_builtin')}
        </p>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      {SECTIONS.map(section => (
        <section key={section} className="adm-panel" aria-labelledby={`adm-set-${section}`}>
          <div className="adm-set-head">
            <h3 id={`adm-set-${section}`} className="adm-h3">{t(`section_${section}`)}</h3>
            <span className="adm-hint">{summary(section)}</span>
          </div>
          <div className="adm-table-wrap adm-table-wrap--flat">
            <table className="adm-table adm-set-table">
              <thead>
                <tr>
                  <th>{t('adm_set_col_setting')}</th>
                  <th>{t('adm_set_col_mode')}</th>
                  <th>{t('adm_set_col_default')}</th>
                  <th>{t('adm_set_col_options')}</th>
                </tr>
              </thead>
              <tbody>
                {bySection(section).map(item => (
                  <SettingRow key={item.key} item={item} rule={draft[item.key]} t={t}
                              onChange={rule => setDraft(d => ({ ...d, [item.key]: rule }))} />
                ))}
              </tbody>
            </table>
          </div>
          {section === 'privacy' && <p className="adm-hint">{t('adm_set_privacy_note')}</p>}
          {section === 'appearance' && <p className="adm-hint">{t('adm_set_appearance_note')}</p>}
        </section>
      ))}

      <div className="adm-panel adm-reset">
        {confirmReset ? (
          <>
            <p className="acc-text">{t('adm_set_reset_confirm')}</p>
            <div className="adm-actions">
              <RetroButton variant="danger" disabled={busy} onClick={() => run(resetSettingsPolicy, 'adm_set_reset_done')}>
                {t('adm_set_reset')}
              </RetroButton>
              <RetroButton disabled={busy} onClick={() => setConfirmReset(false)}>{t('adm_cancel')}</RetroButton>
            </div>
          </>
        ) : (
          <div className="adm-actions">
            <RetroButton disabled={busy || !data.custom} onClick={() => setConfirmReset(true)}>{t('adm_set_reset')}</RetroButton>
            <span className="adm-hint">{t('adm_set_reset_hint')}</span>
          </div>
        )}
      </div>

      {dirtyKeys.length > 0 && (
        <div className="adm-savebar" role="region" aria-label={t('adm_set_unsaved', { count: dirtyKeys.length })}>
          <span className="adm-savebar-text">{t('adm_set_unsaved', { count: dirtyKeys.length })}</span>
          <input className="adm-input adm-input--sm" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          <RetroButton disabled={busy} onClick={() => { setDraft(data.policy); setNotice(null); }}>{t('adm_cancel')}</RetroButton>
          <RetroButton variant="primary" disabled={busy} onClick={() => run(() => saveSettingsPolicy(draft, note.trim()), 'adm_set_saved')}>
            {t('adm_save')}
          </RetroButton>
        </div>
      )}
    </div>
  );
}
