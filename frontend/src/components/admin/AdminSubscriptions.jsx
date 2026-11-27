// src/components/admin/AdminSubscriptions.jsx
// Dashboard › Abonnements (lot A3) : niveaux (nom FR/EN, description, couleur,
// badge, ordre), le niveau par défaut, et le nombre d'abonnés de chacun.
// L'attribution à un joueur se fait depuis sa fiche (Joueurs › fiche).

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useEconomy } from '../../context/EconomyContext';
import { createTier, deleteTier, getAdminTiers, updateTier } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import TierBadge from '../TierBadge';
import { errorOf, formatNumber, goAdmin } from './adminUtils';

const EMPTY = { slug: '', name_fr: '', name_en: '', description_fr: '', description_en: '', color: '#c9a227', badge: '⭐', sort_order: 10 };

function TierForm({ initial, isNew, onSave, onCancel, busy, t }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: k === 'sort_order' ? Number(e.target.value) : e.target.value }));
  const preview = { ...form, badge: form.badge || '' };
  const submit = (e) => {
    e.preventDefault();
    const out = isNew ? form : Object.fromEntries(Object.entries(form).filter(([k, v]) => initial[k] !== v));
    onSave(out);
  };
  return (
    <form className="adm-tier-form" onSubmit={submit}>
      <div className="adm-tier-grid">
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_name_fr')}</span>
          <input className="adm-input" value={form.name_fr} maxLength={40} required onChange={set('name_fr')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_name_en')}</span>
          <input className="adm-input" value={form.name_en} maxLength={40} required onChange={set('name_en')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_slug')}</span>
          <input className="adm-input" value={form.slug} pattern="[a-z0-9][a-z0-9\-]{1,31}" required
                 title={t('adm_tier_slug_hint')} onChange={set('slug')} /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_badge')}</span>
          <input className="adm-input" value={form.badge} maxLength={8} onChange={set('badge')} placeholder="⭐" /></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_color')}</span>
          <span className="adm-color">
            <input type="color" value={form.color} onChange={set('color')} aria-label={t('adm_tier_color')} />
            <input className="adm-input adm-input--sm" value={form.color} pattern="#[0-9a-fA-F]{6}" onChange={set('color')} />
          </span></label>
        <label className="adm-field"><span className="adm-field-label">{t('adm_tier_order')}</span>
          <input type="number" className="adm-input adm-input--sm" value={form.sort_order} min={-1000} max={1000} onChange={set('sort_order')} /></label>
        <label className="adm-field adm-tier-wide"><span className="adm-field-label">{t('adm_tier_desc_fr')}</span>
          <input className="adm-input" value={form.description_fr} maxLength={300} onChange={set('description_fr')} /></label>
        <label className="adm-field adm-tier-wide"><span className="adm-field-label">{t('adm_tier_desc_en')}</span>
          <input className="adm-input" value={form.description_en} maxLength={300} onChange={set('description_en')} /></label>
      </div>
      <div className="adm-actions" style={{ alignItems: 'center' }}>
        <span className="adm-hint">{t('adm_tier_preview')}</span>
        <TierBadge tier={preview} withName />
        <span style={{ flex: 1 }} />
        <RetroButton disabled={busy} onClick={onCancel}>{t('adm_cancel')}</RetroButton>
        <RetroButton type="submit" variant="primary" disabled={busy}>{isNew ? t('adm_tier_create') : t('adm_save')}</RetroButton>
      </div>
      {!form.badge && <p className="adm-hint">{t('adm_tier_no_badge')}</p>}
    </form>
  );
}

export default function AdminSubscriptions() {
  const { t, language } = useLanguage();
  const { reloadPublic } = useEconomy();
  const [tiers, setTiers] = useState(null);
  const [editing, setEditing] = useState(null);       // id | 'new'
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAdminTiers()
      .then(list => { if (!cancelled) setTiers(list); })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      setTiers(await fn());
      setEditing(null); setConfirmDelete(null);
      setNotice(t(doneKey));
      reloadPublic();                                  // badges à jour partout
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (error && !tiers) return <p className="st-note" data-tone="error">{error}</p>;
  if (!tiers) return <div className="adm-loading"><Spinner size={18} /></div>;

  const name = (tier) => (language === 'en' ? tier.name_en : tier.name_fr);

  return (
    <div className="adm-stack">
      <div className="adm-panel adm-intro">
        <p className="acc-text">{t('adm_tier_intro')}</p>
        <p className="adm-hint">{t('adm_tier_assign_hint')}</p>
      </div>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <div className="adm-tiers">
        {tiers.map(tier => (
          <section key={tier.id} className="adm-panel adm-tier" style={{ '--tier-color': tier.color }}>
            {editing === tier.id ? (
              <TierForm initial={{ ...EMPTY, ...tier }} busy={busy} t={t}
                        onCancel={() => setEditing(null)}
                        onSave={patch => run(() => updateTier(tier.id, patch), 'adm_tier_saved')} />
            ) : (
              <>
                <div className="adm-tier-head">
                  <span className="adm-tier-swatch" aria-hidden="true" />
                  <div className="adm-tier-title">
                    <h3 className="adm-h2 adm-tier-name">{name(tier)}</h3>
                    <span className="adm-hint">{tier.slug} · {t('adm_tier_order_n', { n: tier.sort_order })}</span>
                  </div>
                  <TierBadge tier={tier} withName />
                  {tier.is_default && <span className="adm-tier-default">{t('adm_tier_default')}</span>}
                </div>
                <p className="acc-text adm-tier-desc">{(language === 'en' ? tier.description_en : tier.description_fr) || '—'}</p>
                <div className="adm-actions" style={{ alignItems: 'center' }}>
                  <button type="button" className="adm-link" onClick={() => goAdmin(tier.is_default ? 'users?tier=default' : `users?tier=${tier.id}`)}>
                    {t('adm_tier_users', { count: formatNumber(tier.users, language) })}
                  </button>
                  <span style={{ flex: 1 }} />
                  {!tier.is_default && (
                    <RetroButton disabled={busy} onClick={() => run(() => updateTier(tier.id, { is_default: true }), 'adm_tier_saved')}>
                      {t('adm_tier_make_default')}
                    </RetroButton>
                  )}
                  <RetroButton disabled={busy} onClick={() => { setEditing(tier.id); setConfirmDelete(null); }}>{t('adm_tier_edit')}</RetroButton>
                  {!tier.is_default && (
                    <RetroButton variant="danger" disabled={busy} onClick={() => setConfirmDelete(tier.id)}>{t('adm_tier_delete')}</RetroButton>
                  )}
                </div>
                {confirmDelete === tier.id && (
                  <div className="adm-confirm">
                    <p className="acc-text">{t('adm_tier_delete_confirm', { name: name(tier), count: tier.users })}</p>
                    <div className="adm-actions">
                      <RetroButton variant="danger" disabled={busy} onClick={() => run(() => deleteTier(tier.id), 'adm_tier_deleted')}>
                        {t('adm_tier_delete')}
                      </RetroButton>
                      <RetroButton disabled={busy} onClick={() => setConfirmDelete(null)}>{t('adm_cancel')}</RetroButton>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </div>

      {editing === 'new' ? (
        <section className="adm-panel">
          <h3 className="adm-h3">{t('adm_tier_new')}</h3>
          <TierForm initial={EMPTY} isNew busy={busy} t={t} onCancel={() => setEditing(null)}
                    onSave={tier => run(() => createTier(tier), 'adm_tier_created')} />
        </section>
      ) : (
        <div className="adm-actions">
          <RetroButton variant="primary" onClick={() => setEditing('new')}>+ {t('adm_tier_new')}</RetroButton>
        </div>
      )}
    </div>
  );
}
