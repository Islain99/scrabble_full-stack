// src/components/admin/UserEconomyPanels.jsx
// Fiche d'un joueur (lot A3) : son abonnement (attribuer un niveau, avec ou sans
// date de fin) et ses crédits (solde, créditer / débiter avec motif, derniers mouvements).

import React, { useCallback, useEffect, useState } from 'react';
import { adjustCredits, assignTier, getAdminTiers, getUserTransactions } from '../../api/adminService';
import { RetroButton } from '../ui';
import TierBadge from '../TierBadge';
import { errorOf, formatDate, formatNumber } from './adminUtils';

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : '');
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function UserEconomyPanels({ user, onUpdated, t, language }) {
  const [tiers, setTiers] = useState([]);
  const [tierId, setTierId] = useState(user.assigned_tier_id ?? '');
  const [until, setUntil] = useState(toDateInput(user.tier_expires_at));
  const [tierReason, setTierReason] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [txs, setTxs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadTx = useCallback(() => getUserTransactions(user.id, { limit: 10 }).then(setTxs).catch(() => setTxs([])), [user.id]);
  useEffect(() => {
    let cancelled = false;
    getAdminTiers().then(list => { if (!cancelled) setTiers(list); }).catch(() => {});
    getUserTransactions(user.id, { limit: 10 }).then(r => { if (!cancelled) setTxs(r); }).catch(() => { if (!cancelled) setTxs([]); });
    return () => { cancelled = true; };
  }, [user.id]);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      onUpdated(await fn());
      setNotice(t(doneKey));
      loadTx();
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  const name = (tier) => (language === 'en' ? tier.name_en : tier.name_fr);
  const assignable = tiers.filter(x => !x.is_default);
  const current = tiers.find(x => x.id === user.tier_id) ?? tiers.find(x => x.is_default);
  const expired = user.assigned_tier_id && !user.tier_id;
  const tierChanged = String(tierId) !== String(user.assigned_tier_id ?? '') || until !== toDateInput(user.tier_expires_at);
  const value = Math.round(Number(amount) || 0);

  return (
    <div className="adm-two">
      <section className="adm-panel adm-stack" aria-labelledby="adm-user-tier">
        <h3 id="adm-user-tier" className="adm-h3">{t('adm_user_tier')}</h3>
        <div className="adm-actions" style={{ alignItems: 'center' }}>
          {current && <TierBadge tier={{ ...current, badge: current.badge || '•' }} withName />}
          <span className="adm-hint">
            {user.tier_id && user.tier_expires_at ? t('adm_user_tier_until', { date: formatDate(user.tier_expires_at, language, false) })
              : user.tier_id ? t('adm_user_tier_forever') : expired ? t('adm_user_tier_expired') : t('adm_user_tier_none')}
          </span>
        </div>
        <form className="adm-stack" onSubmit={e => {
          e.preventDefault();
          run(() => assignTier(user.id, {
            tierId: tierId === '' ? null : Number(tierId),
            expiresAt: tierId !== '' && until ? new Date(`${until}T23:59:59`).toISOString() : null,
            reason: tierReason.trim() || null,
          }), 'adm_user_tier_done');
          setTierReason('');
        }}>
          <div className="adm-filters">
            <label className="adm-field">
              <span className="adm-field-label">{t('adm_user_tier_level')}</span>
              <select className="adm-input" value={tierId} onChange={e => setTierId(e.target.value)}>
                <option value="">{t('adm_user_tier_default', { name: tiers.find(x => x.is_default) ? name(tiers.find(x => x.is_default)) : '—' })}</option>
                {assignable.map(x => <option key={x.id} value={x.id}>{name(x)}{x.badge ? ` ${x.badge}` : ''}</option>)}
              </select>
            </label>
            <label className="adm-field">
              <span className="adm-field-label">{t('adm_user_tier_end')}</span>
              <input type="date" className="adm-input" value={until} min={tomorrow()} disabled={tierId === ''}
                     onChange={e => setUntil(e.target.value)} />
            </label>
          </div>
          <span className="adm-hint">{t('adm_user_tier_end_hint')}</span>
          <input className="adm-input" value={tierReason} maxLength={200} onChange={e => setTierReason(e.target.value)}
                 placeholder={t('adm_reason_ph_short')} aria-label={t('adm_reason')} />
          <div className="adm-actions">
            <RetroButton type="submit" variant="primary" disabled={busy || !tierChanged}>{t('adm_save')}</RetroButton>
          </div>
        </form>
      </section>

      <section className="adm-panel adm-stack" aria-labelledby="adm-user-credits">
        <h3 id="adm-user-credits" className="adm-h3">{t('adm_user_credits')}</h3>
        <span className="adm-kpi-value">🪙 {formatNumber(user.credits, language)}</span>
        {user.unlocked_palettes?.length > 0 && (
          <span className="adm-hint">{t('adm_user_palettes', { list: user.unlocked_palettes.map(p => t(`palette_${p}`)).join(', ') })}</span>
        )}
        <form className="adm-stack" onSubmit={e => {
          e.preventDefault();
          run(() => adjustCredits(user.id, value, reason.trim()), value > 0 ? 'adm_user_credited' : 'adm_user_debited');
          setAmount(''); setReason('');
        }}>
          <div className="adm-filters">
            <label className="adm-field">
              <span className="adm-field-label">{t('adm_user_amount')}</span>
              <input type="number" className="adm-input adm-input--sm" value={amount} step={1} min={-1000000} max={1000000}
                     onChange={e => setAmount(e.target.value)} placeholder="+50 / −20" />
            </label>
            <label className="adm-field adm-field--grow">
              <span className="adm-field-label">{t('adm_user_amount_reason')}</span>
              <input className="adm-input" value={reason} minLength={3} maxLength={200} required onChange={e => setReason(e.target.value)} />
            </label>
          </div>
          <div className="adm-actions" style={{ alignItems: 'center' }}>
            <RetroButton type="submit" variant={value < 0 ? 'danger' : 'primary'} disabled={busy || value === 0 || reason.trim().length < 3}>
              {value < 0 ? t('adm_user_debit', { count: formatNumber(-value, language) }) : t('adm_user_credit', { count: formatNumber(value, language) })}
            </RetroButton>
            {value < 0 && -value > user.credits && <span className="adm-hint">{t('adm_user_too_much')}</span>}
          </div>
        </form>
        {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
        {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}
        <span className="adm-field-label">{t('adm_user_last_tx')}</span>
        {txs === null ? null : txs.length === 0 ? <p className="adm-empty">{t('adm_cr_none')}</p> : (
          <ul className="adm-log">
            {txs.map(tx => (
              <li key={tx.id} className="adm-log-row">
                <time className="adm-muted" dateTime={tx.created_at}>{formatDate(tx.created_at, language)}</time>
                <span>
                  <strong data-sign={tx.amount > 0 ? '+' : '-'} className="adm-amount">{tx.amount > 0 ? '+' : ''}{formatNumber(tx.amount, language)}</strong>
                  {' '}{t(`eco_kind_${tx.kind}`)}
                  {tx.note && <span className="adm-muted"> — {tx.note}</span>}
                  {tx.admin_name && <span className="adm-muted"> · {t('adm_cr_by', { name: tx.admin_name })}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
