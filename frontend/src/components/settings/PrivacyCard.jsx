// src/components/settings/PrivacyCard.jsx
//
// Paramètres → Confidentialité (lot 8) : chaque joueur choisit qui voit quoi.
// Chaque choix est enregistré tout de suite sur le serveur, qui l'applique
// partout (profil public, recherche, classements, demandes d'ami, présence).
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card, MonoLabel, Spinner } from '../ui';
import { Row, Toggle, SectionTitle } from './SettingsParts';
import { getPrivacy, updatePrivacy } from '../../api/accountService';

const AUDIENCE = ['everyone', 'friends', 'nobody'];

function Choice({ name, options, value, onChange, disabled, t }) {
  return (
    <div className="pv-choice" role="radiogroup" aria-label={name}>
      {options.map(o => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled}
          className="s-chip" data-active={value === o} onClick={() => onChange(o)}>
          {t(`privacy_opt_${o}`)}
        </button>
      ))}
    </div>
  );
}

export default function PrivacyCard() {
  const { t } = useLanguage();
  const { refreshUser } = useAuth();
  const [privacy, setPrivacy] = useState(null);
  const [saving, setSaving] = useState(null);       // clé en cours d'enregistrement
  const [note, setNote] = useState(null);           // { tone, text }

  useEffect(() => {
    let cancelled = false;
    getPrivacy()
      .then(p => { if (!cancelled) setPrivacy(p); })
      .catch(() => { if (!cancelled) setNote({ tone: 'error', text: t('privacy_load_failed') }); });
    return () => { cancelled = true; };
  }, [t]);

  const change = async (key, value) => {
    const previous = privacy;
    setPrivacy(p => ({ ...p, [key]: value }));
    setSaving(key);
    setNote(null);
    try {
      setPrivacy(await updatePrivacy({ [key]: value }));
      setNote({ tone: 'ok', text: t('privacy_saved') });
      refreshUser?.();                                // présence : prise en compte tout de suite
    } catch {
      setPrivacy(previous);
      setNote({ tone: 'error', text: t('privacy_save_failed') });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <Card.Header>
        <SectionTitle emoji="🛡️" label={t('section_privacy')} />
      </Card.Header>
      <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <MonoLabel size="xs" style={{ lineHeight: 1.5 }}>{t('privacy_intro')}</MonoLabel>

        {!privacy ? (note ? null : <Spinner size={18} />) : (
          <>
            <Row label={t('privacy_profile')} desc={t('privacy_profile_desc')}>
              <Choice name={t('privacy_profile')} options={AUDIENCE} value={privacy.profile}
                onChange={v => change('profile', v)} disabled={saving === 'profile'} t={t} />
            </Row>
            <div className="pv-sep" />
            <Row label={t('privacy_stats')} desc={t('privacy_stats_desc')}>
              <Choice name={t('privacy_stats')} options={AUDIENCE} value={privacy.stats}
                onChange={v => change('stats', v)} disabled={saving === 'stats'} t={t} />
            </Row>
            <div className="pv-sep" />
            <Row label={t('privacy_presence')} desc={t('privacy_presence_desc')}>
              <Choice name={t('privacy_presence')} options={['friends', 'nobody']} value={privacy.presence}
                onChange={v => change('presence', v)} disabled={saving === 'presence'} t={t} />
            </Row>
            <div className="pv-sep" />
            <Row label={t('privacy_requests')} desc={t('privacy_requests_desc')}>
              <Choice name={t('privacy_requests')} options={['everyone', 'code']} value={privacy.requests}
                onChange={v => change('requests', v)} disabled={saving === 'requests'} t={t} />
            </Row>
            <div className="pv-sep" />
            <Row label={t('privacy_search')} desc={t('privacy_search_desc')}>
              <Toggle value={privacy.search} onChange={v => change('search', v)}
                label={t('privacy_search')} disabled={saving === 'search'} />
            </Row>
            <div className="pv-sep" />
            <Row label={t('privacy_leaderboard')} desc={t('privacy_leaderboard_desc')}>
              <Toggle value={privacy.leaderboard} onChange={v => change('leaderboard', v)}
                label={t('privacy_leaderboard')} disabled={saving === 'leaderboard'} />
            </Row>
          </>
        )}

        {note && <p role="status" className="st-note" data-tone={note.tone}>{note.text}</p>}
        <MonoLabel size="xs" style={{ lineHeight: 1.5 }}>{t('privacy_always')}</MonoLabel>
      </Card.Body>
    </Card>
  );
}
