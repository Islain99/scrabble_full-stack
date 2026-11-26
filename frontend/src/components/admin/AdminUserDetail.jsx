// src/components/admin/AdminUserDetail.jsx
// Fiche d'un joueur : identité, profil, statistiques, parties récentes, modération,
// actions (désactiver, rôle d'administrateur, pseudo, sourdine) et leur historique.

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getUser, muteUser, updateUser } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import UserBadges from './UserBadges';
import ActionLine from './ActionLine';
import { errorOf, formatDate, formatNumber, goAdmin, isMuted } from './adminUtils';

const MUTES = [
  { key: 'adm_mute_1h', minutes: 60 },
  { key: 'adm_mute_24h', minutes: 24 * 60 },
  { key: 'adm_mute_7d', minutes: 7 * 24 * 60 },
];

function Field({ label, children }) {
  return (
    <div className="adm-kv">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

/** Confirmation en ligne : texte, note facultative (journal), boutons. */
function Confirm({ text, withReason, danger, confirmLabel, onConfirm, onCancel, busy, t }) {
  const [reason, setReason] = useState('');
  return (
    <div className="adm-confirm" role="alertdialog" aria-label={text}>
      <p className="acc-text">{text}</p>
      {withReason && (
        <label className="adm-field">
          <span className="adm-field-label">{t('adm_reason')}</span>
          <input className="adm-input" value={reason} maxLength={200} onChange={e => setReason(e.target.value)}
                 placeholder={t('adm_reason_ph')} />
        </label>
      )}
      <div className="adm-actions">
        <RetroButton variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={() => onConfirm(reason)}>
          {confirmLabel}
        </RetroButton>
        <RetroButton disabled={busy} onClick={onCancel}>{t('adm_cancel')}</RetroButton>
      </div>
    </div>
  );
}

export default function AdminUserDetail({ userId }) {
  const { t, language } = useLanguage();
  const { user: me } = useAuth();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(null);      // disable | enable | promote | demote | rename
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getUser(userId).then(u => { setUser(u); setError(null); }), [userId]);
  useEffect(() => {
    let cancelled = false;
    getUser(userId)
      .then(u => { if (!cancelled) { setUser(u); setError(null); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [userId, t]);

  const run = async (fn, doneKey) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await fn();
      if (updated) setUser(updated); else await load();
      setPending(null);
      setNotice(t(doneKey));
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (error && !user) return (
    <div className="adm-stack">
      <button type="button" className="adm-back" onClick={() => goAdmin('users')}>← {t('adm_back_users')}</button>
      <p className="st-note" data-tone="error">{error}</p>
    </div>
  );
  if (!user) return <div className="adm-loading"><Spinner size={18} /></div>;

  const n = (v) => formatNumber(v, language);
  const isSelf = me?.id === user.id;
  const s = user.stats;
  const confirmProps = { busy, t, onCancel: () => setPending(null) };

  return (
    <div className="adm-stack">
      <button type="button" className="adm-back" onClick={() => goAdmin('users')}>← {t('adm_back_users')}</button>

      <header className="adm-profile-head">
        {user.avatar_url ? <img src={user.avatar_url} alt="" className="adm-avatar adm-avatar--lg" /> :
          <span className="adm-avatar adm-avatar--lg adm-avatar--ph" aria-hidden="true">{user.display_name[0]?.toUpperCase()}</span>}
        <div>
          <h2 className="adm-h2">{user.display_name}</h2>
          <div className="adm-badges">
            <UserBadges user={user} t={t} />
            {isSelf && <span className="adm-muted">{t('adm_its_you')}</span>}
          </div>
        </div>
      </header>

      {notice && <p className="st-note" data-tone="ok" role="status">{notice}</p>}
      {error && <p className="st-note" data-tone="error" role="alert">{error}</p>}

      <div className="adm-two">
        <section className="adm-panel">
          <h3 className="adm-h3">{t('adm_section_account')}</h3>
          <dl className="adm-kvs">
            <Field label={t('adm_col_email')}>{user.email}{user.is_verified ? ` · ${t('adm_verified')}` : ''}</Field>
            <Field label={t('adm_provider')}>{user.auth_provider}</Field>
            <Field label={t('adm_friend_code')}>{user.friend_code}</Field>
            <Field label={t('adm_col_signup')}>{formatDate(user.created_at, language)}</Field>
            <Field label={t('adm_col_last_login')}>{formatDate(user.last_login_at, language)}</Field>
            <Field label="ID">{user.id}</Field>
          </dl>
        </section>
        <section className="adm-panel">
          <h3 className="adm-h3">{t('adm_section_profile')}</h3>
          <dl className="adm-kvs">
            <Field label={t('adm_first_name')}>{user.first_name}</Field>
            <Field label={t('adm_last_name')}>{user.last_name}</Field>
            <Field label={t('adm_age')}>{user.age}</Field>
            <Field label={t('adm_country')}>{user.country}</Field>
            <Field label={t('adm_profile_complete')}>{user.profile_complete ? t('adm_yes') : t('adm_no')}</Field>
            <Field label={t('adm_privacy')}>
              {['profile', 'stats', 'presence'].map(k => `${t(`privacy_${k}`)} : ${t(`privacy_opt_${user.privacy[k]}`)}`).join(' · ')}
            </Field>
          </dl>
          {user.bio && <p className="adm-bio">{user.bio}</p>}
        </section>
      </div>

      <section className="adm-panel">
        <h3 className="adm-h3">{t('adm_section_stats')}</h3>
        <div className="adm-kpis adm-kpis--sm">
          <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_stat_solo')}</span>
            <span className="adm-kpi-value">{n(s.games_played)}</span>
            <span className="adm-kpi-hint">{t('adm_stat_won', { count: n(s.games_won), rate: s.win_rate })}</span></div>
          <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_stat_best_solo')}</span>
            <span className="adm-kpi-value">{n(s.best_score)}</span>
            <span className="adm-kpi-hint">{t('adm_kpi_avg_score', { score: n(s.average_score) })}</span></div>
          <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_stat_best_word')}</span>
            <span className="adm-kpi-value">{user.best_word || '—'}</span>
            <span className="adm-kpi-hint">{s.best_word_score ? `${n(s.best_word_score)} pts` : ''}</span></div>
          <div className="adm-kpi"><span className="adm-kpi-label">{t('adm_stat_mp')}</span>
            <span className="adm-kpi-value">{n(s.mp_games)}</span>
            <span className="adm-kpi-hint">{t('adm_stat_won', { count: n(s.mp_wins), rate: s.mp_win_rate })}</span></div>
          <div className="adm-kpi"><span className="adm-kpi-label">Elo</span>
            <span className="adm-kpi-value">{s.mp_rating}</span>
            <span className="adm-kpi-hint">{t('adm_stat_peak', { rating: s.mp_peak_rating })}</span></div>
          <div className="adm-kpi" data-tone={user.reports_pending ? 'alert' : undefined}>
            <span className="adm-kpi-label">{t('adm_stat_messages')}</span>
            <span className="adm-kpi-value">{n(user.messages_count)}</span>
            <span className="adm-kpi-hint">{t('adm_stat_reports', { count: n(user.reports_against), pending: n(user.reports_pending) })}</span></div>
        </div>
      </section>

      <section className="adm-panel">
        <h3 className="adm-h3">{t('adm_section_actions')}</h3>
        {pending === 'disable' && <Confirm {...confirmProps} danger withReason text={t('adm_confirm_disable', { name: user.display_name })}
          confirmLabel={t('adm_disable')} onConfirm={r => run(() => updateUser(user.id, { is_active: false, reason: r }), 'adm_done_disabled')} />}
        {pending === 'enable' && <Confirm {...confirmProps} withReason text={t('adm_confirm_enable', { name: user.display_name })}
          confirmLabel={t('adm_enable')} onConfirm={r => run(() => updateUser(user.id, { is_active: true, reason: r }), 'adm_done_enabled')} />}
        {pending === 'promote' && <Confirm {...confirmProps} text={t('adm_confirm_promote', { name: user.display_name })}
          confirmLabel={t('adm_promote')} onConfirm={r => run(() => updateUser(user.id, { is_admin: true, reason: r }), 'adm_done_promoted')} />}
        {pending === 'demote' && <Confirm {...confirmProps} danger text={t('adm_confirm_demote', { name: user.display_name })}
          confirmLabel={t('adm_demote')} onConfirm={r => run(() => updateUser(user.id, { is_admin: false, reason: r }), 'adm_done_demoted')} />}
        {pending === 'rename' && (
          <form className="adm-confirm" onSubmit={e => { e.preventDefault(); run(() => updateUser(user.id, { display_name: newName }), 'adm_done_renamed'); }}>
            <label className="adm-field">
              <span className="adm-field-label">{t('adm_new_name')}</span>
              <input className="adm-input" value={newName} minLength={2} maxLength={32} required autoFocus
                     onChange={e => setNewName(e.target.value)} />
            </label>
            <div className="adm-actions">
              <RetroButton type="submit" variant="primary" disabled={busy || newName.trim().length < 2}>{t('adm_rename')}</RetroButton>
              <RetroButton disabled={busy} onClick={() => setPending(null)}>{t('adm_cancel')}</RetroButton>
            </div>
          </form>
        )}

        {!pending && (
          <div className="adm-action-groups">
            <div className="adm-action-group">
              <span className="adm-field-label">{t('adm_group_account')}</span>
              <div className="adm-actions">
                {user.is_active
                  ? <RetroButton variant="danger" disabled={isSelf} onClick={() => setPending('disable')}>{t('adm_disable')}</RetroButton>
                  : <RetroButton variant="primary" onClick={() => setPending('enable')}>{t('adm_enable')}</RetroButton>}
                {user.is_admin
                  ? <RetroButton disabled={isSelf} onClick={() => setPending('demote')}>{t('adm_demote')}</RetroButton>
                  : <RetroButton onClick={() => setPending('promote')}>{t('adm_promote')}</RetroButton>}
                <RetroButton onClick={() => { setNewName(user.display_name); setPending('rename'); }}>{t('adm_rename')}</RetroButton>
              </div>
              {isSelf && <p className="adm-hint">{t('adm_self_hint')}</p>}
            </div>
            <div className="adm-action-group">
              <span className="adm-field-label">
                {t('adm_group_chat')}{isMuted(user) ? ` · ${t('adm_muted_until', { date: formatDate(user.chat_muted_until, language) })}` : ''}
              </span>
              <div className="adm-actions">
                {MUTES.map(m => (
                  <RetroButton key={m.minutes} disabled={busy} onClick={() => run(() => muteUser(user.id, m.minutes), 'adm_done_muted')}>
                    {t(m.key)}
                  </RetroButton>
                ))}
                {isMuted(user) && (
                  <RetroButton variant="primary" disabled={busy} onClick={() => run(() => muteUser(user.id, 0), 'adm_done_unmuted')}>
                    {t('adm_unmute')}
                  </RetroButton>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="adm-panel">
        <h3 className="adm-h3">{t('adm_section_recent_games')}</h3>
        {user.recent_games.length === 0 ? <p className="adm-empty">{t('adm_no_games')}</p> : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr>
                <th>{t('adm_col_date')}</th><th>{t('adm_col_mode')}</th><th>{t('adm_col_opponent')}</th>
                <th className="num">{t('adm_col_score')}</th><th>{t('adm_col_result')}</th>
              </tr></thead>
              <tbody>
                {user.recent_games.map(g => (
                  <tr key={g.game_id}>
                    <td className="adm-muted">{formatDate(g.created_at, language)}</td>
                    <td>{g.mode === 'solo' ? `${t('adm_mode_solo')} · ${t(`diff_${g.difficulty}_label`) === `diff_${g.difficulty}_label` ? g.difficulty : t(`diff_${g.difficulty}_label`)}` : t('adm_mode_mp')}</td>
                    <td>{g.opponent}</td>
                    <td className="num">{g.user_score} – {g.opponent_score}</td>
                    <td>
                      {g.won ? t('adm_result_won') : t('adm_result_lost')}
                      {g.rating_delta != null && <span className="adm-muted"> ({g.rating_delta > 0 ? '+' : ''}{g.rating_delta})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-panel">
        <h3 className="adm-h3">{t('adm_section_history')}</h3>
        {user.actions.length === 0 ? <p className="adm-empty">{t('adm_no_actions')}</p> : (
          <ul className="adm-log">{user.actions.map(a => <ActionLine key={a.id} action={a} showTarget={false} />)}</ul>
        )}
      </section>
    </div>
  );
}
