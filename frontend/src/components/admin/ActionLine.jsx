// src/components/admin/ActionLine.jsx
// Une ligne du journal des administrateurs : « Admin a désactivé Bruno — triche ».
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatDate } from './adminUtils';

function detailText(action, t) {
  const d = action.details || {};
  const parts = [];
  if (d.to) parts.push(t('adm_detail_rename', { from: d.from, to: d.to }));
  if (Array.isArray(d.changed)) parts.push(t('adm_detail_changed', { count: d.changed.length }));
  if (d.minutes) parts.push(t('adm_detail_minutes', { count: d.minutes }));
  if (typeof d.amount === 'number') parts.push(`${d.amount > 0 ? '+' : ''}${d.amount} → ${d.balance_after}`);
  if (action.action === 'user.tier') parts.push(d.tier ? (d.expires_at ? `${d.tier} → ${d.expires_at.slice(0, 10)}` : d.tier) : t('adm_detail_default_tier'));
  if (action.action.startsWith('tier.') && d.slug) parts.push(d.slug);
  if (action.action.startsWith('announcement.') && d.title) parts.push(`« ${d.title} »`);
  if (d.notified) parts.push(t('adm_ann_notified', { count: d.notified }));
  if (d.kept_unlocks) parts.push(t('adm_cr_kept', { count: d.kept_unlocks }));
  if (d.seconds != null && action.action === 'chat.slow_mode') parts.push(t('adm_detail_seconds', { count: d.seconds }));
  if (d.reason) parts.push(`« ${d.reason} »`);
  return parts.join(' · ');
}

export default function ActionLine({ action, showTarget = true }) {
  const { t, language } = useLanguage();
  const key = `adm_act_${action.action.replaceAll('.', '_')}`;
  const label = t(key) === key ? action.action : t(key);
  const extra = detailText(action, t);
  return (
    <li className="adm-log-row">
      <time className="adm-muted" dateTime={action.created_at}>{formatDate(action.created_at, language)}</time>
      <span>
        <strong>{action.admin_name || t('adm_deleted_admin')}</strong>{' '}{label}
        {showTarget && action.target_type === 'user' && action.target_id && (
          <> · <a className="adm-link" href={`#/admin/users/${action.target_id}`}>{action.target_name || `#${action.target_id}`}</a></>
        )}
        {extra && <span className="adm-muted"> — {extra}</span>}
      </span>
    </li>
  );
}
