// src/components/settings/AccountCard.jsx
//
// Paramètres → Compte et confidentialité (lot 7, Loi 25) :
//   - politique de confidentialité (pour tous) ;
//   - télécharger mes données (JSON) ;
//   - supprimer mon compte (retaper son pseudo).
import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card, RetroButton, Spinner } from '../ui';
import { Row, SectionTitle } from './SettingsParts';
import { exportMyData } from '../../api/accountService';

const errorOf = (err, fallback) => err?.response?.data?.detail || fallback;

/** Propose le fichier : téléchargement (navigateur) ou partage (téléphone). */
async function saveJson(data, filename) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  if (Capacitor.isNativePlatform()) {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
    await navigator.clipboard?.writeText(text);
    return 'copied';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

function DeleteAccountModal({ onClose, onDeleted }) {
  const { t } = useLanguage();
  const { user, deleteAccount } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const same = typed.trim().toLocaleLowerCase() === (user?.display_name ?? '').trim().toLocaleLowerCase();
  const submit = async (e) => {
    e.preventDefault();
    if (!same) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(typed.trim());
      onDeleted();
    } catch (err) {
      setError(errorOf(err, t('acc_delete_failed')));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="acc-del-title" className="mh-backdrop"
      onClick={() => { if (!busy) onClose(); }}>
      <form className="mh-panel rr-panel acc-del" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 id="acc-del-title" className="mh-title">{t('acc_delete_title')}</h2>
        <div className="rr-body">
          <p className="acc-text">{t('acc_delete_intro')}</p>
          <ul className="acc-list">
            <li>{t('acc_delete_item_profile')}</li>
            <li>{t('acc_delete_item_games')}</li>
            <li>{t('acc_delete_item_social')}</li>
            <li>{t('acc_delete_item_messages')}</li>
            <li>{t('acc_delete_item_live')}</li>
          </ul>
          <p className="acc-text">{t('acc_delete_export_first')}</p>
          <label className="acc-label" htmlFor="acc-del-name">
            {t('acc_delete_type', { name: user?.display_name ?? '' })}
          </label>
          <input id="acc-del-name" className="s-input" autoComplete="off" value={typed}
            onChange={e => setTyped(e.target.value)} disabled={busy} autoFocus />
          {error && <p className="rr-blocked" role="alert">{error}</p>}
        </div>
        <div className="rr-actions">
          <RetroButton type="button" variant="default" disabled={busy} onClick={onClose}>{t('btn_cancel')}</RetroButton>
          <RetroButton type="submit" variant="danger" disabled={!same || busy}>
            {busy ? <Spinner size={12} /> : t('acc_delete_confirm')}
          </RetroButton>
        </div>
      </form>
    </div>
  );
}

export default function AccountCard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState(null);        // { tone, text }
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const doExport = async () => {
    setExporting(true);
    setNote(null);
    try {
      const data = await exportMyData();
      const stamp = new Date().toISOString().slice(0, 10);
      const how = await saveJson(data, `scrabble-mes-donnees-${stamp}.json`);
      setNote({ tone: 'ok', text: t(how === 'copied' ? 'acc_export_copied' : 'acc_export_ok') });
    } catch (err) {
      setNote({ tone: 'error', text: errorOf(err, t('acc_export_failed')) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <SectionTitle emoji="🔒" label={t('section_account')} />
      </Card.Header>
      <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {deleted && <p role="status" className="st-note" data-tone="ok">{t('acc_deleted')}</p>}

        <Row label={t('acc_privacy')} desc={t('acc_privacy_desc')}>
          <a className="acc-link" href="#/privacy">{t('acc_privacy_link')}</a>
        </Row>

        {user && (
          <>
            <div style={{ borderTop: '1px solid var(--border-muted)' }} />
            <Row label={t('acc_export')} desc={t('acc_export_desc')}>
              <RetroButton variant="default" disabled={exporting} onClick={doExport}>
                {exporting ? <Spinner size={12} /> : t('acc_export_btn')}
              </RetroButton>
            </Row>
            {note && <p role="status" className="st-note" data-tone={note.tone}>{note.text}</p>}

            <div style={{ borderTop: '1px solid var(--border-muted)' }} />
            <Row label={t('acc_delete')} desc={t('acc_delete_desc')}>
              <RetroButton variant="danger" onClick={() => setConfirming(true)}>{t('acc_delete_btn')}</RetroButton>
            </Row>
          </>
        )}
      </Card.Body>
      {confirming && (
        <DeleteAccountModal
          onClose={() => setConfirming(false)}
          onDeleted={() => { setConfirming(false); setDeleted(true); }}
        />
      )}
    </Card>
  );
}
