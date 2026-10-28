// src/components/chat/ChatThread.jsx
//
// Fil d'une conversation (lot 6) : page Messages et tiroir de chat en partie.
//   - historique par pages (REST), puis messages en direct (/chat/{clé}/messages) ;
//   - envoi (500 caractères, Entrée pour envoyer, Maj+Entrée pour aller à la ligne) ;
//   - signaler, supprimer (auteur ou administrateur), rendre muet (administrateur) ;
//   - messages des joueurs bloqués masqués.
// Le parent le monte avec key={conversation.id} : chaque conversation repart d'un état neuf.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getRtdb } from '../../firebase';
import * as chat from '../../api/chatService';
import { getFriends } from '../../api/friendsService';
import { RetroButton, Spinner } from '../ui';

const MAX_BODY = 500;
const errorOf = (err, t) => err?.response?.data?.detail || t('fr_error');

function MessageMenu({ msg, mine, isAdmin, onClose, onDone }) {
  const { t } = useLanguage();
  const [step, setStep] = useState('menu');      // menu | report | done
  const [error, setError] = useState(null);
  const run = async (fn, next = null) => {
    setError(null);
    try { await fn(); if (next) setStep(next); else onDone(); } catch (err) { setError(errorOf(err, t)); }
  };
  return (
    <div className="ch-menu" role="menu" onClick={e => e.stopPropagation()}>
      {error && <p className="rr-blocked">{error}</p>}
      {step === 'menu' && (
        <>
          {!mine && <button type="button" role="menuitem" onClick={() => setStep('report')}>⚑ {t('msg_report')}</button>}
          {(mine || isAdmin) && (
            <button type="button" role="menuitem" className="ch-danger"
              onClick={() => run(() => chat.deleteMessage(msg.id))}>✕ {t('msg_delete')}</button>
          )}
          {isAdmin && !mine && msg.author_id && (
            <>
              <button type="button" role="menuitem" onClick={() => run(() => chat.muteUser(msg.author_id, 15), 'muted')}>🔇 {t('msg_mute_15')}</button>
              <button type="button" role="menuitem" onClick={() => run(() => chat.muteUser(msg.author_id, 24 * 60), 'muted')}>🔇 {t('msg_mute_day')}</button>
            </>
          )}
          <button type="button" role="menuitem" onClick={onClose}>{t('btn_cancel')}</button>
        </>
      )}
      {step === 'report' && (
        <>
          <span className="rr-label">{t('msg_report_why')}</span>
          {['insult', 'spam', 'other'].map(r => (
            <button key={r} type="button" role="menuitem" onClick={() => run(() => chat.reportMessage(msg.id, r), 'done')}>
              {t(`msg_reason_${r}`)}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={onClose}>{t('btn_cancel')}</button>
        </>
      )}
      {step === 'done' && (
        <><span className="ch-ok">✓ {t('msg_reported')}</span><button type="button" role="menuitem" onClick={onClose}>{t('mh_close')}</button></>
      )}
      {step === 'muted' && (
        <><span className="ch-ok">✓ {t('msg_muted_done', { name: msg.author_name })}</span><button type="button" role="menuitem" onClick={onClose}>{t('mh_close')}</button></>
      )}
    </div>
  );
}

export default function ChatThread({ conversation, compact = false, headerExtra = null }) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [byId, setById] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [blocked, setBlocked] = useState(() => new Set());
  const [slowMode, setSlowMode] = useState(conversation.slow_mode_s ?? 0);
  const listRef = useRef(null);
  const nearBottom = useRef(true);
  const isGlobal = conversation.kind === 'global';
  const isAdmin = !!user?.is_admin;

  const merge = useCallback((list) => setById(prev => {
    const next = { ...prev };
    list.forEach(m => { next[m.id] = { ...(next[m.id] ?? {}), ...m }; });
    return next;
  }), []);

  // Historique, puis direct
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;
    chat.listMessages(conversation.id)
      .then(page => { if (!cancelled) { merge(page.messages); setHasMore(page.has_more); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    getRtdb()
      .then(({ db, ref, onValue }) => {
        if (cancelled) return;
        unsubscribe = onValue(ref(db, `/chat/${conversation.key}/messages`), (snap) => {
          const v = snap.val();
          if (v && typeof v === 'object') {
            merge(Object.values(v).filter(m => m && m.id).map(m => ({ ...m, id: Number(m.id), deleted: !!m.deleted })));
          }
        }, () => { unsubscribe = null; });
      })
      .catch(() => {});
    getFriends().then(d => { if (!cancelled) setBlocked(new Set(d.blocked.map(b => b.user_id))); }).catch(() => {});
    return () => { cancelled = true; unsubscribe?.(); };
    // t : seulement pour le message d'erreur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.key, merge]);

  const messages = useMemo(
    () => Object.values(byId).filter(m => !blocked.has(m.author_id)).sort((a, b) => a.id - b.id),
    [byId, blocked],
  );
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  // Défilement : on suit le bas tant que le joueur y est
  useEffect(() => {
    const el = listRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Lu jusqu'au dernier message affiché
  useEffect(() => {
    if (isGlobal || !lastId) return undefined;
    const id = setTimeout(() => { chat.markRead(conversation.id).catch(() => {}); }, 500);
    return () => clearTimeout(id);
  }, [lastId, isGlobal, conversation.id]);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const before = el ? el.scrollHeight : 0;
    try {
      const page = await chat.listMessages(conversation.id, messages[0].id);
      merge(page.messages);
      setHasMore(page.has_more);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await chat.sendMessage(conversation.id, body);
      merge([msg]);
      setDraft('');
      nearBottom.current = true;
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setSending(false);
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  const time = (ms) => new Date(ms).toLocaleTimeString(language === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });
  const day = (ms) => new Date(ms).toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={compact ? 'ch-thread ch-thread--compact' : 'ch-thread'}>
      <header className="ch-head">
        <div className="ch-head-text">
          <h2 className="ch-title">{isGlobal ? t('msg_global') : conversation.title}</h2>
          <span className="ch-sub">
            {isGlobal ? t('msg_global_sub')
              : conversation.kind === 'group' ? conversation.members.map(m => m.display_name).join(', ')
                : conversation.kind === 'game' ? t('msg_game_sub') : t('msg_private_sub')}
            {isGlobal && slowMode > 0 ? ` · ${t('msg_slow_on', { s: slowMode })}` : ''}
          </span>
        </div>
        {headerExtra}
      </header>

      {isGlobal && isAdmin && (
        <div className="ch-admin-bar" role="radiogroup" aria-label={t('msg_slow_mode')}>
          <span className="rr-label">{t('msg_slow_mode')}</span>
          {[0, 10, 30, 60].map(s => (
            <button key={s} type="button" role="radio" aria-checked={slowMode === s} className="rr-chip"
              onClick={() => chat.setSlowMode(s).then(c => setSlowMode(c.slow_mode_s)).catch(err => setError(errorOf(err, t)))}>
              {s ? `${s} s` : t('rr_none')}
            </button>
          ))}
        </div>
      )}

      <div className="ch-list" ref={listRef} onScroll={onScroll} onClick={() => setMenuFor(null)} data-testid="chat-list">
        {loading ? <div className="ch-center"><Spinner size="sm" /></div> : (
          <>
            {hasMore && (
              <button type="button" className="ch-older" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? '…' : t('msg_older')}
              </button>
            )}
            {messages.length === 0 && <p className="ch-empty">{t('msg_empty')}</p>}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.author_id === user?.id;
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const grouped = !newDay && prev && prev.author_id === m.author_id && m.created_at - prev.created_at < 5 * 60000;
              return (
                <React.Fragment key={m.id}>
                  {newDay && <div className="ch-day">{day(m.created_at)}</div>}
                  <div className={`ch-msg${mine ? ' ch-msg--mine' : ''}${grouped ? ' ch-msg--grouped' : ''}`} data-testid="chat-msg">
                    {!grouped && !mine && <span className="ch-author">{m.author_name}</span>}
                    <div className="ch-bubble-row">
                      <div className={`ch-bubble${m.deleted ? ' ch-bubble--deleted' : ''}`}>
                        {m.deleted ? t('msg_deleted') : m.body}
                        <span className="ch-time">{time(m.created_at)}</span>
                      </div>
                      {!m.deleted && (
                        <button type="button" className="ch-more" aria-label={t('msg_actions')}
                          onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === m.id ? null : m.id); }}>⋯</button>
                      )}
                    </div>
                    {menuFor === m.id && (
                      <MessageMenu msg={m} mine={mine} isAdmin={isAdmin} onClose={() => setMenuFor(null)} onDone={() => setMenuFor(null)} />
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      <div className="ch-compose">
        {error && <p className="rr-blocked" role="alert">{error}</p>}
        <div className="ch-compose-row">
          <textarea
            className="rr-input ch-input"
            rows={compact ? 1 : 2}
            value={draft}
            maxLength={MAX_BODY}
            placeholder={t('msg_placeholder')}
            aria-label={t('msg_placeholder')}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <RetroButton variant="primary" onClick={send} disabled={!draft.trim() || sending}>
            {sending ? '…' : t('msg_send')}
          </RetroButton>
        </div>
        <div className="ch-compose-meta">
          <span>{isGlobal ? t('msg_global_rules') : t('msg_privacy')}</span>
          <span className={draft.length > MAX_BODY - 50 ? 'ch-count ch-count--warn' : 'ch-count'}>{draft.length}/{MAX_BODY}</span>
        </div>
      </div>
    </div>
  );
}
