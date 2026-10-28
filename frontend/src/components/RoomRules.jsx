// src/components/RoomRules.jsx
//
// Règles d'une salle multijoueur (choisies par l'hôte, figées à la création) :
//   - RoomSetupModal   : formulaire de l'hôte avant de créer la salle
//   - RoomPreviewModal : ce que voit l'invité avant de rejoindre
//   - RulesSummary     : résumé des règles (aperçu, salle d'attente)
// Les valeurs proposées sont celles acceptées par le serveur (RoomSettings).
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RetroButton, Spinner } from './ui';
import {
  TURN_CHOICES, PASS_CHOICES, TARGET_CHOICES, DEFAULT_SETTINGS, NAME_MAX, formatTurn, roomDisplayName,
} from '../utils/roomRules';

function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

function Chips({ label, options, value, onChange }) {
  return (
    <div className="rr-field" role="radiogroup" aria-label={label}>
      <span className="rr-label">{label}</span>
      <div className="rr-chips">
        {options.map(opt => (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={opt.value === value}
            className="rr-chip"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Résumé ─────────────────────────────────────────────────────────

export function RulesSummary({ settings }) {
  const { t } = useLanguage();
  if (!settings) return null;
  const rows = [
    [t('rr_turn'),    formatTurn(settings.turn_seconds, t)],
    [t('rr_swap'),    settings.allow_swap ? t('rr_allowed') : t('rr_forbidden')],
    [t('rr_preview'), settings.show_preview ? t('rr_shown') : t('rr_hidden')],
    [t('rr_passes'),  t('rr_passes_value', { count: settings.max_passes })],
    [t('rr_target'),  settings.target_score ? `${settings.target_score} pts` : t('rr_none')],
  ];
  return (
    <dl className="rr-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="rr-summary-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Formulaire de l'hôte ───────────────────────────────────────────

export function RoomSetupModal({ open, onCancel, onCreate, busy = false, hostName = '' }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  useEscape(open, onCancel);
  if (!open) return null;

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    onCreate({ ...form, name: name || null });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rr-setup-title" className="mh-backdrop" onClick={onCancel}>
      <form className="mh-panel rr-panel" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 id="rr-setup-title" className="mh-title">{t('rr_setup_title')}</h2>
        <div className="rr-body">
          <label className="rr-field">
            <span className="rr-label">{t('rr_name')}</span>
            <input
              className="rr-input"
              value={form.name}
              maxLength={NAME_MAX}
              placeholder={t('rr_default_name', { name: hostName })}
              onChange={e => set('name')(e.target.value)}
            />
          </label>
          <Chips
            label={t('rr_turn')}
            value={form.turn_seconds}
            onChange={set('turn_seconds')}
            options={TURN_CHOICES.map(v => ({ value: v, label: formatTurn(v, t) }))}
          />
          {form.turn_seconds > 0 && <p className="rr-hint">{t('rr_turn_hint')}</p>}
          <Chips
            label={t('rr_swap')}
            value={form.allow_swap}
            onChange={set('allow_swap')}
            options={[{ value: true, label: t('rr_allowed') }, { value: false, label: t('rr_forbidden') }]}
          />
          <Chips
            label={t('rr_preview')}
            value={form.show_preview}
            onChange={set('show_preview')}
            options={[{ value: true, label: t('rr_shown') }, { value: false, label: t('rr_hidden') }]}
          />
          <Chips
            label={t('rr_passes')}
            value={form.max_passes}
            onChange={set('max_passes')}
            options={PASS_CHOICES.map(v => ({ value: v, label: String(v) }))}
          />
          <Chips
            label={t('rr_target')}
            value={form.target_score}
            onChange={set('target_score')}
            options={TARGET_CHOICES.map(v => ({ value: v, label: v ? String(v) : t('rr_none') }))}
          />
        </div>
        <div className="rr-actions">
          <RetroButton type="button" variant="default" onClick={onCancel}>{t('btn_cancel')}</RetroButton>
          <RetroButton type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" /> : t('rr_create')}
          </RetroButton>
        </div>
      </form>
    </div>
  );
}

// ── Aperçu avant de rejoindre ──────────────────────────────────────

export function RoomPreviewModal({ preview, onJoin, onCancel, busy = false }) {
  const { t } = useLanguage();
  useEscape(!!preview, onCancel);
  if (!preview) return null;

  const blocked = !preview.can_join;
  const reason = preview.status !== 'WAITING' ? t('rr_full') : t('rr_own_room');

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rr-preview-title" className="mh-backdrop" onClick={onCancel}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <div>
          <h2 id="rr-preview-title" className="mh-title">
            {roomDisplayName(preview.settings, preview.host_name, t)}
          </h2>
          <p className="rr-host">{t('rr_hosted_by', { name: preview.host_name })}</p>
        </div>
        <RulesSummary settings={preview.settings} />
        {blocked && <p className="rr-blocked" role="status">{reason}</p>}
        <div className="rr-actions">
          <RetroButton variant="default" onClick={onCancel}>{t('btn_cancel')}</RetroButton>
          <RetroButton variant="primary" onClick={onJoin} disabled={busy || blocked}>
            {busy ? <Spinner size="sm" /> : t('mp_join_btn')}
          </RetroButton>
        </div>
      </div>
    </div>
  );
}
