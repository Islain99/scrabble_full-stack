// src/pages/MessagesPage.jsx
//
// Messagerie (lot 6) : liste des conversations (salon universel en tête) et fil
// de la conversation choisie. Deux colonnes sur ordinateur, plein écran sur
// téléphone. Messages privés réservés aux amis ; groupes de 3 à 20 amis.
// Les administrateurs ont un onglet « Modération » (signalements).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationsContext';
import { useIsMobile } from '../hooks/useViewport';
import * as chat from '../api/chatService';
import { getFriendsList } from '../api/friendsService';
import ChatThread from '../components/chat/ChatThread';
import { RetroButton, Spinner } from '../components/ui';

const errorOf = (err, t) => err?.response?.data?.detail || t('fr_error');

/** #/messages?c=12 → 12 */
function convFromHash() {
  const query = (window.location.hash || '').split('?')[1];
  const id = query ? Number(new URLSearchParams(query).get('c')) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function useEscape(onEscape) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

// ── Nouvelle conversation (ami) ou nouveau groupe ─────────────────

function NewConversationModal({ mode, onClose, onCreated }) {
  const { t } = useLanguage();
  const [friends, setFriends] = useState(null);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  useEffect(() => {
    let cancelled = false;
    getFriendsList().then(list => { if (!cancelled) setFriends(list); }).catch(() => { if (!cancelled) setFriends([]); });
    return () => { cancelled = true; };
  }, []);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { onCreated(await fn()); } catch (err) { setError(errorOf(err, t)); } finally { setBusy(false); }
  };
  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nc-title" className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <h2 id="nc-title" className="mh-title">{mode === 'group' ? t('msg_new_group') : t('msg_new_private')}</h2>
        {mode === 'group' && (
          <label className="rr-field">
            <span className="rr-label">{t('fr_group_name')}</span>
            <input className="rr-input" value={name} maxLength={40} onChange={e => setName(e.target.value)} />
          </label>
        )}
        {error && <p className="rr-blocked" role="alert">{error}</p>}
        <div className="rr-body">
          {friends === null ? <Spinner size="sm" /> : friends.length === 0 ? <p className="pr-empty">{t('msg_need_friends')}</p> : (
            <ul className="fr-list">
              {friends.map(f => (
                <li key={f.user_id} className="fr-row">
                  <span className="fr-avatar" aria-hidden="true">{f.display_name.slice(0, 1).toUpperCase()}</span>
                  <span className="fr-main"><span className="fr-name">{f.display_name}</span></span>
                  {mode === 'group' ? (
                    <button type="button" role="checkbox" aria-checked={picked.includes(f.user_id)}
                      aria-label={f.display_name} className="rr-chip" onClick={() => toggle(f.user_id)}>
                      {picked.includes(f.user_id) ? '✓' : '+'}
                    </button>
                  ) : (
                    <RetroButton variant="primary" disabled={busy} onClick={() => run(() => chat.openPrivate(f.user_id))}>
                      {t('msg_write')}
                    </RetroButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rr-actions">
          <RetroButton variant="default" onClick={onClose}>{t('btn_cancel')}</RetroButton>
          {mode === 'group' && (
            <RetroButton variant="primary" disabled={busy || !name.trim() || picked.length < 2}
              onClick={() => run(() => chat.createGroup(name.trim(), picked))}>
              {t('msg_create_group', { count: picked.length + 1 })}
            </RetroButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Gestion d'un groupe ───────────────────────────────────────────

function GroupModal({ conversation, onClose, onChanged, onLeft }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const owner = conversation.my_role === 'owner';
  const [name, setName] = useState(conversation.name ?? '');
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState(null);
  useEscape(onClose);

  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    getFriendsList().then(list => { if (!cancelled) setFriends(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [owner]);

  const run = async (fn, after = onChanged) => {
    setError(null);
    try { const r = await fn(); after(r); } catch (err) { setError(errorOf(err, t)); }
  };
  const memberIds = new Set(conversation.members.map(m => m.user_id));
  const addable = friends.filter(f => !memberIds.has(f.user_id));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gm-title" className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <h2 id="gm-title" className="mh-title">{conversation.title}</h2>
        {error && <p className="rr-blocked" role="alert">{error}</p>}
        <div className="rr-body">
          {owner && (
            <form className="fr-group-edit" onSubmit={e => { e.preventDefault(); run(() => chat.renameGroup(conversation.id, name)); }}>
              <input className="rr-input" value={name} maxLength={40} aria-label={t('fr_group_name')} onChange={e => setName(e.target.value)} />
              <RetroButton type="submit" variant="default" disabled={!name.trim()}>{t('msg_rename')}</RetroButton>
            </form>
          )}
          <span className="rr-label">{t('msg_members', { count: conversation.members.length })}</span>
          <ul className="fr-list">
            {conversation.members.map(m => (
              <li key={m.user_id} className="fr-row">
                <span className="fr-main"><span className="fr-name">{m.display_name}{m.role === 'owner' ? ' ★' : ''}</span></span>
                {owner && m.user_id !== user?.id && (
                  <button type="button" className="fr-icon-btn" aria-label={t('msg_remove_member', { name: m.display_name })}
                    onClick={() => run(() => chat.removeMember(conversation.id, m.user_id))}>✕</button>
                )}
              </li>
            ))}
          </ul>
          {owner && addable.length > 0 && (
            <>
              <span className="rr-label">{t('msg_add_friends')}</span>
              <div className="rr-chips">
                {addable.map(f => (
                  <button key={f.user_id} type="button" className="rr-chip"
                    onClick={() => run(() => chat.addMembers(conversation.id, [f.user_id]))}>+ {f.display_name}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="rr-actions">
          <RetroButton variant="danger" onClick={() => run(() => chat.removeMember(conversation.id, user.id), onLeft)}>{t('msg_leave')}</RetroButton>
          <RetroButton variant="primary" onClick={onClose}>{t('mh_close')}</RetroButton>
        </div>
      </div>
    </div>
  );
}

// ── Modération (administrateurs) ──────────────────────────────────

function ReportsPanel() {
  const { t } = useLanguage();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => chat.listReports().then(setReports).catch(err => setError(errorOf(err, t))), [t]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => { setError(null); try { await fn(); await load(); } catch (err) { setError(errorOf(err, t)); } };

  return (
    <div className="ch-thread">
      <header className="ch-head"><div className="ch-head-text"><h2 className="ch-title">{t('msg_moderation')}</h2>
        <span className="ch-sub">{t('msg_moderation_sub')}</span></div></header>
      <div className="ch-list">
        {error && <p className="rr-blocked">{error}</p>}
        {reports === null ? <Spinner size="sm" /> : reports.length === 0 ? <p className="ch-empty">{t('msg_no_reports')}</p> : (
          <ul className="fr-list">
            {reports.map(r => (
              <li key={r.id} className="fr-row ch-report">
                <span className="fr-main">
                  <span className="fr-name">{r.message.author_name}</span>
                  <span className="ch-report-body">{r.message.body || t('msg_deleted')}</span>
                  <span className="fr-meta">
                    {t(`msg_kind_${r.conversation_kind}`)} · {t(`msg_reason_${r.reason || 'other'}`)} · {t('msg_reports_count', { count: r.reports_count })}
                  </span>
                </span>
                <span className="fr-actions">
                  <RetroButton variant="danger" onClick={() => act(() => chat.resolveReport(r.id, 'delete'))}>{t('msg_delete')}</RetroButton>
                  {r.message.author_id && (
                    <RetroButton variant="default" onClick={() => act(() => chat.muteUser(r.message.author_id, 24 * 60))}>{t('msg_mute_day')}</RetroButton>
                  )}
                  <RetroButton variant="default" onClick={() => act(() => chat.resolveReport(r.id, 'dismiss'))}>{t('msg_dismiss')}</RetroButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { inbox } = useNotifications();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(() => convFromHash());
  const [creating, setCreating] = useState(null);       // 'private' | 'group' | null
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState(null);
  const [todayKey, setTodayKey] = useState('');
  useEffect(() => {
    const tick = () => setTodayKey(new Date().toDateString());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const reload = useCallback(async () => {
    try { setConversations(await chat.listConversations()); } catch (err) { setError(errorOf(err, t)); }
  }, [t]);
  useEffect(() => {
    let cancelled = false;
    chat.listConversations().then(c => { if (!cancelled) setConversations(c); }).catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  // Une conversation apparue dans la boîte (groupe créé par un ami…) : on recharge la liste
  const known = useMemo(() => new Set((conversations ?? []).map(c => String(c.id))), [conversations]);
  const missing = Object.keys(inbox).filter(id => !known.has(id)).join(',');
  const triedMissing = useRef('');
  useEffect(() => {
    if (!missing || !conversations || triedMissing.current === missing) return undefined;
    triedMissing.current = missing;          // une seule tentative par nouvel ensemble
    let cancelled = false;
    chat.listConversations().then(c => { if (!cancelled) setConversations(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [missing, conversations]);

  const live = (c) => {
    const e = inbox[c.id];
    return e ? { ...c, unread: Number(e.unread) || 0, last_preview: e.preview ?? c.last_preview, title: e.title ?? c.title,
      last_ms: e.last_at ?? (c.last_message_at ? Date.parse(c.last_message_at) : 0) }
      : { ...c, last_ms: c.last_message_at ? Date.parse(c.last_message_at) : 0 };
  };
  const list = (conversations ?? []).map(live);
  const sorted = [...list.filter(c => c.kind === 'global'), ...list.filter(c => c.kind !== 'global').sort((a, b) => b.last_ms - a.last_ms)];
  const current = selected === 'moderation' ? null : sorted.find(c => c.id === selected) ?? (isMobile ? null : sorted[0]);

  const choose = (id) => {
    setSelected(id);
    window.history.replaceState(null, '', typeof id === 'number' ? `#/messages?c=${id}` : '#/messages');
  };
  const created = async (conv) => {
    setCreating(null);
    await reload();
    choose(conv.id);
  };

  // Heure pour aujourd'hui, date sinon
  const fmt = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    const today = d.toDateString() === todayKey;
    return d.toLocaleString(language === 'fr' ? 'fr-CA' : 'en-CA', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });
  };

  const showList = !isMobile || (!current && selected !== 'moderation');
  const showThread = !isMobile || current || selected === 'moderation';

  return (
    <div className="s-page ch-page">
      <div className="ch-layout">
        {showList && (
          <aside className="ch-side" aria-label={t('nav_messages')}>
            <div className="ch-side-head">
              <h1 className="ch-side-title">{t('nav_messages')}</h1>
              <div className="ch-side-actions">
                <RetroButton variant="primary" onClick={() => setCreating('private')}>✎ {t('msg_new')}</RetroButton>
                <RetroButton variant="default" onClick={() => setCreating('group')}>👥 {t('msg_group')}</RetroButton>
              </div>
              {/* Lot 7 : pas de chiffrement de bout en bout, modération des signalements */}
              <p className="ch-privacy">
                🔓 {t('msg_privacy_note')} <a className="acc-link" href="#/privacy">{t('msg_privacy_more')}</a>
              </p>
            </div>
            {error && <p className="rr-blocked">{error}</p>}
            {conversations === null ? <Spinner size="sm" /> : (
              <ul className="ch-convs" data-testid="conversations">
                {sorted.map(c => (
                  <li key={c.id}>
                    <button type="button" className={`ch-conv${current?.id === c.id ? ' ch-conv--active' : ''}`} onClick={() => choose(c.id)}>
                      <span className="ch-conv-icon" aria-hidden="true">
                        {c.kind === 'global' ? '🌍' : c.kind === 'group' ? '👥' : c.kind === 'game' ? '🎲' : (c.title ?? '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="ch-conv-main">
                        <span className="ch-conv-title">{c.kind === 'global' ? t('msg_global') : c.title}</span>
                        <span className="ch-conv-preview">{c.kind === 'global' ? t('msg_global_sub') : (c.last_preview ?? t('msg_no_message'))}</span>
                      </span>
                      <span className="ch-conv-side">
                        {c.kind !== 'global' && <span className="ch-conv-time">{fmt(c.last_ms)}</span>}
                        {c.unread > 0 && !c.muted && <span className="nt-badge ch-unread">{c.unread > 99 ? '99+' : c.unread}</span>}
                        {c.muted && <span aria-label={t('msg_muted')}>🔕</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {user?.is_admin && (
                  <li>
                    <button type="button" className={`ch-conv${selected === 'moderation' ? ' ch-conv--active' : ''}`} onClick={() => choose('moderation')}>
                      <span className="ch-conv-icon" aria-hidden="true">⚑</span>
                      <span className="ch-conv-main"><span className="ch-conv-title">{t('msg_moderation')}</span></span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </aside>
        )}

        {showThread && (
          <section className="ch-main">
            {isMobile && (
              <button type="button" className="ch-back" onClick={() => choose(null)}>‹ {t('nav_messages')}</button>
            )}
            {selected === 'moderation' && user?.is_admin ? <ReportsPanel /> : current ? (
              <ChatThread
                key={current.id}
                conversation={current}
                headerExtra={current.kind !== 'global' && (
                  <div className="ch-head-actions">
                    <button type="button" className="fr-icon-btn" aria-pressed={current.muted}
                      aria-label={current.muted ? t('msg_unmute') : t('msg_mute')} title={current.muted ? t('msg_unmute') : t('msg_mute')}
                      onClick={() => chat.muteConversation(current.id, !current.muted).then(reload).catch(() => {})}>
                      {current.muted ? '🔕' : '🔔'}
                    </button>
                    {current.kind === 'group' && (
                      <button type="button" className="fr-icon-btn" aria-label={t('msg_manage')} onClick={() => setManaging(true)}>⚙</button>
                    )}
                  </div>
                )}
              />
            ) : conversations && <p className="ch-empty">{t('msg_pick')}</p>}
          </section>
        )}
      </div>

      {creating && <NewConversationModal mode={creating} onClose={() => setCreating(null)} onCreated={created} />}
      {managing && current?.kind === 'group' && (
        <GroupModal
          conversation={current}
          onClose={() => setManaging(false)}
          onChanged={() => reload()}
          onLeft={() => { setManaging(false); choose(null); reload(); }}
        />
      )}
    </div>
  );
}
