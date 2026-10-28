// src/pages/FriendsPage.jsx
//
// Amis (lot 4) : code ami, ajout (code ou pseudo), demandes reçues et
// envoyées, liste d'amis avec leur présence, groupes personnels, blocages.
// Les groupes sont privés : un ami ne sait pas dans quel groupe il est rangé.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../hooks/useToast';
import { useFriendsPresence } from '../hooks/useFriendsPresence';
import * as fs from '../api/friendsService';
import { Toast } from '../components/Toast';
import { Card, PageHeader, RetroButton, Spinner } from '../components/ui';
import { RoomSetupModal } from '../components/RoomRules';
import { inviteFriend } from '../api/notificationsService';
import { openPrivate } from '../api/chatService';
import { useAuth } from '../context/AuthContext';
import { FRIENDS_CHANGED_EVENT, useNotifications } from '../context/NotificationsContext';

const GROUP_COLORS = ['olive', 'gold', 'brick', 'tobacco', 'blue', 'plum'];

const errorOf = (err, fallback) => err?.response?.data?.detail || fallback;

/** « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j » */
function timeAgo(ms, now, t, language) {
  if (!ms || !now) return '';
  const min = Math.max(0, Math.floor((now - ms) / 60000));
  if (min < 1) return t('pr_just_now');
  if (min < 60) return t('pr_ago', { time: `${min} min` });
  const h = Math.floor(min / 60);
  if (h < 48) return t('pr_ago', { time: `${h} h` });
  return t('pr_ago', { time: `${Math.floor(h / 24)} ${language === 'fr' ? 'j' : 'd'}` });
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [intervalMs]);
  return now;
}

function Section({ title, count, children, action }) {
  return (
    <section className="fr-section">
      <header className="fr-section-head">
        <h2 className="fr-section-title">
          {title}{count ? <span className="fr-count">{count}</span> : null}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Avatar({ user }) {
  return (
    <span className="fr-avatar" aria-hidden="true">
      {user.avatar_url
        ? <img src={user.avatar_url} alt="" />
        : (user.display_name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

function PresenceDot({ state }) {
  return <span className={`fr-dot fr-dot--${state || 'offline'}`} aria-hidden="true" />;
}

// ── Mon code + ajout ──────────────────────────────────────────────

function AddFriend({ myCode, onChanged, addToast }) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(myCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const search = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    try {
      setResults(await fs.searchUsers(query));
    } catch (err) {
      addToast(errorOf(err, t('fr_error')), 'error');
    } finally {
      setBusy(false);
    }
  };

  const request = async (user) => {
    try {
      const res = await fs.sendFriendRequest({ userId: user.user_id });
      addToast(res.status === 'accepted'
        ? t('fr_now_friends', { name: user.display_name })
        : t('fr_request_sent', { name: user.display_name }), 'success');
      setResults(rs => rs?.map(r => r.user_id === user.user_id
        ? { ...r, relation: res.status === 'accepted' ? 'friend' : 'outgoing' } : r));
      onChanged();
    } catch (err) {
      addToast(errorOf(err, t('fr_error')), 'error');
    }
  };

  const relationLabel = { friend: t('fr_rel_friend'), outgoing: t('fr_rel_outgoing'), incoming: t('fr_rel_incoming') };

  return (
    <Card className="fr-card">
      <div className="fr-mycode">
        <div>
          <span className="rr-label">{t('fr_my_code')}</span>
          <div className="fr-code" data-testid="my-friend-code">{myCode}</div>
          <p className="rr-hint">{t('fr_my_code_hint')}</p>
        </div>
        <RetroButton variant="default" onClick={copy}>{copied ? `✓ ${t('mp_copied')}` : t('mp_copy')}</RetroButton>
      </div>

      <form className="fr-search" onSubmit={search}>
        <label className="rr-label" htmlFor="fr-q">{t('fr_add_title')}</label>
        <div className="fr-search-row">
          <input
            id="fr-q"
            className="rr-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('fr_add_ph')}
            autoComplete="off"
            spellCheck={false}
          />
          <RetroButton type="submit" variant="primary" disabled={busy || q.trim().length < 2}>
            {busy ? <Spinner size="sm" /> : t('fr_search')}
          </RetroButton>
        </div>
      </form>

      {results && (
        results.length === 0 ? <p className="pr-empty">{t('fr_no_result')}</p> : (
          <ul className="fr-list">
            {results.map(u => (
              <li key={u.user_id} className="fr-row">
                <Avatar user={u} />
                <span className="fr-main">
                  <span className="fr-name">{u.display_name}</span>
                  <span className="fr-meta">
                    {u.friend_code}{u.country ? ` · ${u.country}` : ''} · {t('fr_games', { count: u.games_played })}
                  </span>
                </span>
                {u.relation === 'none'
                  ? <RetroButton variant="primary" onClick={() => request(u)}>{t('fr_add')}</RetroButton>
                  : <span className="pr-tag">{relationLabel[u.relation]}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

// ── Menu d'un ami : groupes, retirer, bloquer ─────────────────────

function FriendMenu({ friend, groups, onToggleGroup, onRemove, onBlock, onClose }) {
  const { t } = useLanguage();
  const [confirmBlock, setConfirmBlock] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fr-menu-title" className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <h2 id="fr-menu-title" className="mh-title">{friend.display_name}</h2>
        <div className="rr-field">
          <span className="rr-label">{t('fr_groups')}</span>
          {groups.length === 0 ? <p className="rr-hint">{t('fr_no_groups')}</p> : (
            <div className="rr-chips">
              {groups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  role="checkbox"
                  aria-checked={friend.group_ids.includes(g.id)}
                  className={`rr-chip fr-gchip fr-color--${g.color}`}
                  onClick={() => onToggleGroup(g, friend)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {confirmBlock && <p className="rr-blocked" role="status">{t('fr_block_confirm', { name: friend.display_name })}</p>}
        <div className="rr-actions">
          {confirmBlock ? (
            <>
              <RetroButton variant="default" onClick={() => setConfirmBlock(false)}>{t('btn_cancel')}</RetroButton>
              <RetroButton variant="danger" onClick={() => onBlock(friend)}>{t('fr_block_yes')}</RetroButton>
            </>
          ) : (
            <>
              <RetroButton variant="primary" onClick={() => openPrivate(friend.user_id)
                .then(c => { window.location.hash = `#/messages?c=${c.id}`; })
                .catch(() => {})}>✉ {t('msg_write')}</RetroButton>
              <RetroButton variant="default" onClick={() => onRemove(friend)}>{t('fr_remove')}</RetroButton>
              <RetroButton variant="danger" onClick={() => setConfirmBlock(true)}>{t('fr_block')}</RetroButton>
              <RetroButton variant="primary" onClick={onClose}>{t('mh_close')}</RetroButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Gestion des groupes ───────────────────────────────────────────

function GroupsModal({ groups, onClose, onChanged, addToast }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [color, setColor] = useState('olive');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn) => {
    try { await fn(); onChanged(); } catch (err) { addToast(errorOf(err, t('fr_error')), 'error'); }
  };
  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(async () => { await fs.createGroup(name.trim(), color); setName(''); });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fr-groups-title" className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel rr-panel" onClick={e => e.stopPropagation()}>
        <h2 id="fr-groups-title" className="mh-title">{t('fr_groups_manage')}</h2>
        <p className="rr-hint">{t('fr_groups_private')}</p>
        <div className="rr-body">
          {groups.map(g => (
            <div key={g.id} className="fr-group-edit">
              <input
                className="rr-input"
                defaultValue={g.name}
                maxLength={30}
                aria-label={t('fr_group_name')}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v && v !== g.name) run(() => fs.updateGroup(g.id, { name: v }));
                }}
              />
              <div className="fr-swatches" role="radiogroup" aria-label={t('fr_group_color')}>
                {GROUP_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={g.color === c}
                    aria-label={c}
                    className={`fr-swatch fr-color--${c}`}
                    onClick={() => run(() => fs.updateGroup(g.id, { color: c }))}
                  />
                ))}
              </div>
              <button type="button" className="fr-icon-btn" aria-label={t('fr_group_delete')}
                onClick={() => run(() => fs.deleteGroup(g.id))}>✕</button>
            </div>
          ))}
          <form className="fr-group-edit" onSubmit={create}>
            <input
              className="rr-input"
              value={name}
              maxLength={30}
              placeholder={t('fr_group_new')}
              aria-label={t('fr_group_new')}
              onChange={e => setName(e.target.value)}
            />
            <div className="fr-swatches" role="radiogroup" aria-label={t('fr_group_color')}>
              {GROUP_COLORS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                  className={`fr-swatch fr-color--${c}`} onClick={() => setColor(c)} />
              ))}
            </div>
            <RetroButton type="submit" variant="primary" disabled={!name.trim()}>+</RetroButton>
          </form>
        </div>
        <div className="rr-actions">
          <RetroButton variant="primary" onClick={onClose}>{t('mh_close')}</RetroButton>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function FriendsPage() {
  const { t, language } = useLanguage();
  const { toasts, dismissToast, addToast } = useToast();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');           // 'all' | 'online' | id de groupe
  const [menuFor, setMenuFor] = useState(null);          // user_id
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState(null);      // ami à inviter (lot 5)
  const [inviting, setInviting] = useState(false);
  const { user } = useAuth();
  const closeInvite = useCallback(() => setInviteFor(null), []);
  const sendInvite = async (settings) => {
    setInviting(true);
    try {
      await inviteFriend(inviteFor.user_id, settings);
      setInviteFor(null);
      window.location.hash = '#/multiplayer';        // salle d'attente : suivi de l'invitation
    } catch (err) {
      addToast(errorOf(err, t('fr_error')), 'error');
    } finally {
      setInviting(false);
    }
  };
  const now = useNow();

  const reload = useCallback(async () => {
    try {
      setData(await fs.getFriends());
    } catch (err) {
      addToast(errorOf(err, t('fr_error')), 'error');
    }
  }, [addToast, t]);

  useEffect(() => {
    let cancelled = false;
    fs.getFriends()
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) addToast(errorOf(err, t('fr_error')), 'error'); });
    return () => { cancelled = true; };
  }, [addToast, t]);

  // Lot 5 : une demande reçue, acceptée ou traitée depuis la cloche met la page à jour
  const { items: notifications } = useNotifications();
  const friendSignal = notifications.filter(n => n.type?.startsWith('friend')).map(n => n.key).join(',');
  const lastSignal = useRef(friendSignal);
  useEffect(() => {
    if (lastSignal.current === friendSignal) return;
    lastSignal.current = friendSignal;
    reload();
  }, [friendSignal, reload]);
  useEffect(() => {
    window.addEventListener(FRIENDS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(FRIENDS_CHANGED_EVENT, reload);
  }, [reload]);

  const presence = useFriendsPresence(data?.friends.map(f => f.firebase_uid));
  const stateOf = (f) => presence[f.firebase_uid]?.state ?? 'offline';

  const friends = useMemo(() => {
    const rank = { playing: 0, online: 1, offline: 2 };
    const list = (data?.friends ?? []).filter(f => {
      if (filter === 'online') return stateOf(f) !== 'offline';
      if (typeof filter === 'number') return f.group_ids.includes(filter);
      return true;
    });
    return list.sort((a, b) => (rank[stateOf(a)] ?? 2) - (rank[stateOf(b)] ?? 2)
      || a.display_name.localeCompare(b.display_name));
    // stateOf lit `presence`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, presence]);

  const act = async (fn, okMessage) => {
    try {
      await fn();
      if (okMessage) addToast(okMessage, 'success');
      await reload();
    } catch (err) {
      addToast(errorOf(err, t('fr_error')), 'error');
    }
  };

  const toggleGroup = (group, friend) => act(() => fs.setGroupMembers(
    group.id,
    friend.group_ids.includes(group.id)
      ? group.member_ids.filter(id => id !== friend.user_id)
      : [...group.member_ids, friend.user_id],
  ));

  const statusText = (f) => {
    const p = presence[f.firebase_uid];
    if (p?.state === 'playing') return t('fr_playing');
    if (p?.state === 'online') return t('fr_online');
    if (p?.last_active) return t('fr_seen', { time: timeAgo(Number(p.last_active), now, t, language) });
    return t('fr_offline');
  };

  if (!data) {
    return (
      <div className="s-page">
        <Toast toasts={toasts} onDismiss={dismissToast} />
        <div className="fr-page"><PageHeader title={t('nav_friends')} /><Spinner size="lg" /></div>
      </div>
    );
  }

  const menuFriend = data.friends.find(f => f.user_id === menuFor) ?? null;
  const onlineCount = data.friends.filter(f => stateOf(f) !== 'offline').length;
  const groupById = Object.fromEntries(data.groups.map(g => [g.id, g]));

  return (
    <div className="s-page">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <div className="fr-page">
        <PageHeader style={{ marginBottom: 0 }} title={t('nav_friends')} subtitle={t('fr_subtitle', { count: data.friends.length, online: onlineCount })} />

        <AddFriend myCode={data.my_code} onChanged={reload} addToast={addToast} />

        {data.incoming.length > 0 && (
          <Section title={t('fr_incoming')} count={data.incoming.length}>
            <ul className="fr-list">
              {data.incoming.map(r => (
                <li key={r.id} className="fr-row">
                  <Avatar user={r.user} />
                  <span className="fr-main">
                    <span className="fr-name">{r.user.display_name}</span>
                    <span className="fr-meta">{r.user.friend_code} · {timeAgo(Date.parse(r.created_at), now, t, language)}</span>
                  </span>
                  <span className="fr-actions">
                    <RetroButton variant="primary" onClick={() => act(() => fs.acceptRequest(r.id),
                      t('fr_now_friends', { name: r.user.display_name }))}>{t('fr_accept')}</RetroButton>
                    <RetroButton variant="default" onClick={() => act(() => fs.declineRequest(r.id))}>{t('fr_decline')}</RetroButton>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          title={t('fr_friends')}
          count={data.friends.length}
          action={<RetroButton variant="default" onClick={() => setGroupsOpen(true)}>{t('fr_groups_manage')}</RetroButton>}
        >
          <div className="rr-chips" role="radiogroup" aria-label={t('fr_filter')}>
            {[{ v: 'all', l: t('fr_all') }, { v: 'online', l: t('fr_filter_online') },
              ...data.groups.map(g => ({ v: g.id, l: g.name, c: g.color }))].map(o => (
              <button key={String(o.v)} type="button" role="radio" aria-checked={filter === o.v}
                className={`rr-chip${o.c ? ` fr-gchip fr-color--${o.c}` : ''}`} onClick={() => setFilter(o.v)}>
                {o.l}
              </button>
            ))}
          </div>

          {data.friends.length === 0 ? <p className="pr-empty">{t('fr_empty')}</p>
            : friends.length === 0 ? <p className="pr-empty">{t('pr_no_match')}</p> : (
              <ul className="fr-list" data-testid="friends-list">
                {friends.map(f => (
                  <li key={f.user_id} className="fr-row">
                    <span className="fr-avatar-wrap"><Avatar user={f} /><PresenceDot state={stateOf(f)} /></span>
                    <span className="fr-main">
                      <span className="fr-name">
                        {f.display_name}
                        {f.group_ids.map(id => groupById[id] && (
                          <span key={id} className={`fr-gdot fr-color--${groupById[id].color}`} title={groupById[id].name} />
                        ))}
                      </span>
                      <span className={`fr-meta fr-status--${stateOf(f)}`}>{statusText(f)}</span>
                    </span>
                    <RetroButton variant={stateOf(f) === 'online' ? 'primary' : 'default'} onClick={() => setInviteFor(f)}>
                      {t('iv_invite')}
                    </RetroButton>
                    <button type="button" className="fr-icon-btn" aria-label={t('fr_options', { name: f.display_name })}
                      onClick={() => setMenuFor(f.user_id)}>⋯</button>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        {data.outgoing.length > 0 && (
          <Section title={t('fr_outgoing')} count={data.outgoing.length}>
            <ul className="fr-list">
              {data.outgoing.map(r => (
                <li key={r.id} className="fr-row">
                  <Avatar user={r.user} />
                  <span className="fr-main">
                    <span className="fr-name">{r.user.display_name}</span>
                    <span className="fr-meta">{t('fr_rel_outgoing')} · {timeAgo(Date.parse(r.created_at), now, t, language)}</span>
                  </span>
                  <RetroButton variant="default" onClick={() => act(() => fs.cancelRequest(r.id))}>{t('btn_cancel')}</RetroButton>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.blocked.length > 0 && (
          <details className="fr-section fr-blocked">
            <summary className="fr-section-title">{t('fr_blocked')} <span className="fr-count">{data.blocked.length}</span></summary>
            <ul className="fr-list">
              {data.blocked.map(u => (
                <li key={u.user_id} className="fr-row">
                  <Avatar user={u} />
                  <span className="fr-main"><span className="fr-name">{u.display_name}</span></span>
                  <RetroButton variant="default" onClick={() => act(() => fs.unblockUser(u.user_id))}>{t('fr_unblock')}</RetroButton>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {menuFriend && (
        <FriendMenu
          friend={menuFriend}
          groups={data.groups}
          onToggleGroup={toggleGroup}
          onRemove={(f) => { setMenuFor(null); act(() => fs.removeFriend(f.user_id)); }}
          onBlock={(f) => { setMenuFor(null); act(() => fs.blockUser(f.user_id)); }}
          onClose={() => setMenuFor(null)}
        />
      )}
      {inviteFor && (
        <RoomSetupModal
          open
          onCancel={closeInvite}
          onCreate={sendInvite}
          busy={inviting}
          hostName={user?.display_name ?? ''}
          title={t('iv_invite_title', { name: inviteFor.display_name })}
          submitLabel={t('iv_send')}
          initial={{ visibility: 'friends' }}
        />
      )}
      {groupsOpen && (
        <GroupsModal groups={data.groups} onClose={() => setGroupsOpen(false)} onChanged={reload} addToast={addToast} />
      )}
    </div>
  );
}
