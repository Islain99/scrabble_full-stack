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
import { useAppConfig } from '../../context/AppConfigContext';
import { choosable } from '../../utils/appConfig';
import { Managed, RowList } from './Managed';

const AUDIENCE = ['everyone', 'friends', 'nobody'];

// Ordre d'affichage ; options : null pour un oui / non
const ROWS = [
  { key: 'profile',     options: AUDIENCE },
  { key: 'stats',       options: AUDIENCE },
  { key: 'presence',    options: ['friends', 'nobody'] },
  { key: 'requests',    options: ['everyone', 'code'] },
  { key: 'search',      options: null },
  { key: 'leaderboard', options: null },
];

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
  const { policy, isHidden, isLocked } = useAppConfig();   // lot A2 : réglages fixés par l'admin
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
          <RowList>
            {ROWS.filter(r => !isHidden(`privacy.${r.key}`)).map(r => {
              const label = t(`privacy_${r.key}`);
              const control = r.options ? (
                <Choice name={label} options={choosable(policy, `privacy.${r.key}`, r.options)} value={privacy[r.key]}
                  onChange={v => change(r.key, v)} disabled={saving === r.key} t={t} />
              ) : (
                <Toggle value={privacy[r.key]} onChange={v => change(r.key, v)} label={label} disabled={saving === r.key} />
              );
              return (
                <Row key={r.key} label={label} desc={t(`privacy_${r.key}_desc`)}>
                  <Managed locked={isLocked(`privacy.${r.key}`)}>{control}</Managed>
                </Row>
              );
            })}
          </RowList>
        )}

        {note && <p role="status" className="st-note" data-tone={note.tone}>{note.text}</p>}
        <MonoLabel size="xs" style={{ lineHeight: 1.5 }}>{t('privacy_always')}</MonoLabel>
      </Card.Body>
    </Card>
  );
}
