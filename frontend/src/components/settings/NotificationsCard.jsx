// src/components/settings/NotificationsCard.jsx
//
// Paramètres → Notifications (lot 7).
//   - « Sur cet appareil » : inscrit ou retire ce navigateur / ce téléphone ;
//   - catégories (invitations, amis, messages, parties) : réglage du compte,
//     valable sur tous les appareils (préférences synchronisées) ;
//   - notification d'essai.
import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Card, MonoLabel, RetroButton, Spinner } from '../ui';
import { Row, Toggle, SectionTitle } from './SettingsParts';
import { disablePush, enablePush, pushEnabledHere, pushSupport } from '../../utils/push';
import { sendTestPush } from '../../api/accountService';

const CATEGORIES = [
  { key: 'pushInvites',  label: 'push_cat_invites',  desc: 'push_cat_invites_desc'  },
  { key: 'pushFriends',  label: 'push_cat_friends',  desc: 'push_cat_friends_desc'  },
  { key: 'pushMessages', label: 'push_cat_messages', desc: 'push_cat_messages_desc' },
  { key: 'pushTurn',     label: 'push_cat_turn',     desc: 'push_cat_turn_desc'     },
];

export default function NotificationsCard({ settings, update }) {
  const { t, language } = useLanguage();
  const [support, setSupport] = useState(() => pushSupport());
  const [enabled, setEnabled] = useState(() => pushEnabledHere());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);           // { tone: 'ok' | 'error', text }

  const toggleDevice = async (on) => {
    setBusy(true);
    setNote(null);
    try {
      if (on) {
        await enablePush(language);
        setEnabled(true);
        setNote({ tone: 'ok', text: t('push_enabled_ok') });
      } else {
        await disablePush();
        setEnabled(false);
      }
    } catch (err) {
      setEnabled(false);
      setSupport(pushSupport());
      setNote({ tone: 'error', text: err?.message === 'denied' ? t('push_denied') : t('push_failed') });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { devices } = await sendTestPush();
      setNote(devices > 0
        ? { tone: 'ok', text: t('push_test_sent', { count: devices }) }
        : { tone: 'error', text: t('push_test_none') });
    } catch {
      setNote({ tone: 'error', text: t('push_failed') });
    } finally {
      setBusy(false);
    }
  };

  const unavailable = support === 'unsupported' || support === 'no-config';
  const deviceDesc = support === 'unsupported' ? t('push_unsupported')
    : support === 'no-config' ? t('push_no_config')
    : support === 'denied' ? t('push_denied')
    : t('push_device_desc');

  return (
    <Card>
      <Card.Header>
        <SectionTitle emoji="🔔" label={t('section_notifications')} />
      </Card.Header>
      <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

        <Row label={t('push_device')} desc={deviceDesc}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {busy && <Spinner size={14} />}
            <Toggle value={enabled} onChange={toggleDevice} label={t('push_device')}
              disabled={busy || unavailable || (support === 'denied' && !enabled)} />
          </div>
        </Row>

        {note && (
          <p role="status" className="st-note" data-tone={note.tone}>{note.text}</p>
        )}

        <div style={{ borderTop: '1px solid var(--border-muted)' }} />

        <MonoLabel size="xs" style={{ lineHeight: 1.5 }}>{t('push_categories_hint')}</MonoLabel>
        {CATEGORIES.map(c => (
          <Row key={c.key} label={t(c.label)} desc={t(c.desc)}>
            <Toggle value={settings[c.key] !== false} onChange={v => update(c.key, v)} label={t(c.label)} />
          </Row>
        ))}

        {enabled && (
          <>
            <div style={{ borderTop: '1px solid var(--border-muted)' }} />
            <Row label={t('push_test')} desc={t('push_test_desc')}>
              <RetroButton variant="default" disabled={busy} onClick={test}>{t('push_test_btn')}</RetroButton>
            </Row>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
