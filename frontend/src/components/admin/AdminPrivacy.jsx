// src/components/admin/AdminPrivacy.jsx
// Dashboard › Confidentialité (lot A2) : modifier et publier la politique de
// confidentialité (FR et EN). Sans version publiée, la page #/privacy affiche
// le texte livré avec l'application ; l'éditeur part alors de ce texte.
// Texte brut uniquement : une ligne = un paragraphe ou un point de liste.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getPrivacyPolicy, resetPrivacyPolicy, savePrivacyPolicy } from '../../api/adminService';
import { privacy as builtin, PRIVACY_UPDATED } from '../../i18n/privacy';
import { fromDocument } from '../../utils/privacyDoc';
import { RetroButton, Spinner } from '../ui';
import { errorOf, formatDate } from './adminUtils';

const LANGS = ['fr', 'en'];
const today = () => new Date().toISOString().slice(0, 10);

// Document (serveur ou texte d'origine) → brouillon éditable (lignes en texte)
const toDraftLang = (p) => ({
  title: p.title ?? '',
  intro: p.intro ?? '',
  contactLabel: p.contactLabel ?? '',
  contactFallback: p.contactFallback ?? '',
  sections: (p.sections ?? []).map(s => ({
    title: s.title ?? '',
    warning: !!s.warning,
    paragraphs: (s.paragraphs ?? []).join('\n'),
    items: (s.items ?? []).join('\n'),
  })),
});

const toDraft = (doc) => ({
  updated_on: doc?.updated_on ?? PRIVACY_UPDATED,
  fr: toDraftLang(doc?.fr ?? builtin.fr),
  en: toDraftLang(doc?.en ?? builtin.en),
});

const lines = (text) => text.split('\n').map(l => l.trim()).filter(Boolean);

// Brouillon → document envoyé au serveur
const toDocument = (draft, note) => ({
  updated_on: draft.updated_on,
  note: note || null,
  ...Object.fromEntries(LANGS.map(l => [l, {
    ...draft[l],
    sections: draft[l].sections.map(s => ({
      title: s.title, warning: s.warning, paragraphs: lines(s.paragraphs), items: lines(s.items),
    })),
  }])),
});

function Field({ label, children, hint }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && <span className="adm-hint">{hint}</span>}
    </label>
  );
}

function SectionEditor({ section, index, count, onChange, onMove, onRemove, t }) {
  const set = (patch) => onChange({ ...section, ...patch });
  return (
    <fieldset className="adm-pp-section" data-warning={section.warning || undefined}>
      <legend className="adm-field-label">{t('adm_pp_section_n', { n: index + 1 })}</legend>
      <div className="adm-pp-row">
        <Field label={t('adm_pp_section_title')}>
          <input className="adm-input" value={section.title} maxLength={160} onChange={e => set({ title: e.target.value })} />
        </Field>
        <div className="adm-actions adm-pp-tools">
          <button type="button" className="s-chip" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('adm_pp_up')}>↑</button>
          <button type="button" className="s-chip" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('adm_pp_down')}>↓</button>
          <button type="button" className="s-chip" disabled={count === 1} onClick={onRemove}>{t('adm_pp_remove')}</button>
        </div>
      </div>
      <label className="adm-check">
        <input type="checkbox" checked={section.warning} onChange={e => set({ warning: e.target.checked })} />
        {t('adm_pp_warning')}
      </label>
      <Field label={t('adm_pp_paragraphs')} hint={t('adm_pp_lines_hint')}>
        <textarea className="adm-input adm-textarea" rows={Math.max(2, section.paragraphs.split('\n').length)}
                  value={section.paragraphs} onChange={e => set({ paragraphs: e.target.value })} />
      </Field>
      <Field label={t('adm_pp_items')} hint={t('adm_pp_lines_hint')}>
        <textarea className="adm-input adm-textarea" rows={Math.max(3, section.items.split('\n').length)}
                  value={section.items} onChange={e => set({ items: e.target.value })} />
      </Field>
    </fieldset>
  );
}

function Preview({ draft, lang, t }) {
  const p = fromDocument(toDocument(draft), lang, t);
  return (
    <article className="pv-page adm-pp-preview" lang={lang}>
      <header className="pv-head">
        <h1 className="pv-title">{p.title}</h1>
        <p className="pv-updated">{p.updated}</p>
        <p className="pv-intro">{p.intro}</p>
      </header>
      {p.sections.map((s, i) => (
        <section key={i} className="pv-section" data-warning={s.warning || undefined}>
          <h2 className="pv-h2">{s.warning ? '⚠️ ' : ''}{s.title}</h2>
          {s.paragraphs.map((text, j) => <p key={j} className="pv-p">{text}</p>)}
          {s.items.length > 0 && <ul className="pv-list">{s.items.map((text, j) => <li key={j}>{text}</li>)}</ul>}
        </section>
      ))}
      <section className="pv-section">
        <h2 className="pv-h2">{p.contactLabel}</h2>
        <p className="pv-p">{p.contactFallback}</p>
      </section>
    </article>
  );
}

export default function AdminPrivacy() {
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);         // brouillon au dernier chargement / enregistrement
  const [lang, setLang] = useState('fr');
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = (d) => { const dr = toDraft(d.document); setData(d); setDraft(dr); setSaved(dr); };

  useEffect(() => {
    let cancelled = false;
    getPrivacyPolicy()
      .then(d => { if (!cancelled) load(d); })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  if (error && !data) return <p className="st-note" data-tone="error">{error}</p>;
  if (!draft) return <div className="adm-loading"><Spinner size={18} /></div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const L = draft[lang];
  const setL = (patch) => setDraft(d => ({ ...d, [lang]: { ...d[lang], ...patch } }));
  const setSection = (i, s) => setL({ sections: L.sections.map((x, j) => (j === i ? s : x)) });
  const moveSection = (i, dir) => {
    const next = [...L.sections];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setL({ sections: next });
  };

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      load(await fn());
      setNote(''); setConfirmReset(false);
      setNotice(t(doneKey));
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-stack">
      <div className="adm-panel adm-intro">
        <p className="acc-text">{t('adm_pp_intro')}</p>
        <p className="adm-hint">
          {data.custom
            ? t('adm_pp_published_by', { date: formatDate(data.updated_at, language), name: data.updated_by_name ?? '—' })
            : t('adm_pp_builtin')}
          {' · '}<a className="adm-link" href="#/privacy" target="_blank" rel="noreferrer">{t('adm_pp_open_page')}</a>
        </p>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <div className="adm-toolbar">
        <div className="adm-seg" role="radiogroup" aria-label={t('adm_pp_language')}>
          {LANGS.map(l => (
            <button key={l} type="button" role="radio" className="adm-seg-btn"
                    aria-checked={lang === l} onClick={() => setLang(l)}>
              {l === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
        <button type="button" className="s-chip" data-active={preview} onClick={() => setPreview(v => !v)}>
          {preview ? t('adm_pp_edit') : t('adm_pp_preview')}
        </button>
        <span className="adm-toolbar-note">{t('adm_pp_both_languages')}</span>
      </div>

      {preview ? <Preview draft={draft} lang={lang} t={t} /> : (
        <div className="adm-panel adm-stack adm-pp-form" lang={lang}>
          <div className="adm-pp-row">
            <Field label={t('adm_pp_title')}>
              <input className="adm-input" value={L.title} maxLength={160} onChange={e => setL({ title: e.target.value })} />
            </Field>
            <Field label={t('adm_pp_updated_on')} hint={t('adm_pp_updated_hint')}>
              <input type="date" className="adm-input" value={draft.updated_on} max={today()}
                     onChange={e => setDraft(d => ({ ...d, updated_on: e.target.value }))} />
            </Field>
          </div>
          <Field label={t('adm_pp_intro_field')}>
            <textarea className="adm-input adm-textarea" rows={4} value={L.intro} maxLength={4000}
                      onChange={e => setL({ intro: e.target.value })} />
          </Field>

          {L.sections.map((s, i) => (
            <SectionEditor key={i} section={s} index={i} count={L.sections.length} t={t}
                           onChange={x => setSection(i, x)} onMove={dir => moveSection(i, dir)}
                           onRemove={() => setL({ sections: L.sections.filter((_, j) => j !== i) })} />
          ))}
          <div className="adm-actions">
            <RetroButton onClick={() => setL({ sections: [...L.sections, { title: '', warning: false, paragraphs: '', items: '' }] })}>
              + {t('adm_pp_add_section')}
            </RetroButton>
          </div>

          <div className="adm-pp-row adm-pp-row--even">
            <Field label={t('adm_pp_contact_label')}>
              <input className="adm-input" value={L.contactLabel} maxLength={200} onChange={e => setL({ contactLabel: e.target.value })} />
            </Field>
            <Field label={t('adm_pp_contact_fallback')} hint={t('adm_pp_contact_hint')}>
              <input className="adm-input" value={L.contactFallback} maxLength={1000} onChange={e => setL({ contactFallback: e.target.value })} />
            </Field>
          </div>
        </div>
      )}

      <div className="adm-panel adm-reset">
        {confirmReset ? (
          <>
            <p className="acc-text">{t('adm_pp_reset_confirm')}</p>
            <div className="adm-actions">
              <RetroButton variant="danger" disabled={busy} onClick={() => run(resetPrivacyPolicy, 'adm_pp_reset_done')}>{t('adm_pp_reset')}</RetroButton>
              <RetroButton disabled={busy} onClick={() => setConfirmReset(false)}>{t('adm_cancel')}</RetroButton>
            </div>
          </>
        ) : (
          <div className="adm-actions">
            <RetroButton disabled={busy || !data.custom} onClick={() => setConfirmReset(true)}>{t('adm_pp_reset')}</RetroButton>
            <span className="adm-hint">{t('adm_pp_reset_hint')}</span>
          </div>
        )}
      </div>

      {(dirty || !data.custom) && (
        <div className="adm-savebar" role="region" aria-label={t('adm_pp_publish')}>
          <span className="adm-savebar-text">{dirty ? t('adm_pp_unsaved') : t('adm_pp_not_published')}</span>
          <input className="adm-input adm-input--sm" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          {dirty && <RetroButton disabled={busy} onClick={() => { setDraft(saved); setNotice(null); }}>{t('adm_cancel')}</RetroButton>}
          <RetroButton variant="primary" disabled={busy} onClick={() => run(() => savePrivacyPolicy(toDocument(draft, note.trim())), 'adm_pp_published')}>
            {t('adm_pp_publish')}
          </RetroButton>
        </div>
      )}
    </div>
  );
}
