// src/components/admin/AdminJournal.jsx
// Journal des actions des administrateurs (dashboard, modération de la messagerie).
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { listActions } from '../../api/adminService';
import { RetroButton, Spinner } from '../ui';
import ActionLine from './ActionLine';
import { errorOf } from './adminUtils';

const PAGE = 50;

export default function AdminJournal() {
  const { t } = useLanguage();
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listActions({ limit: PAGE })
      .then(rows => { if (!cancelled) { setItems(rows); setMore(rows.length === PAGE); } })
      .catch(err => { if (!cancelled) setError(errorOf(err, t)); });
    return () => { cancelled = true; };
  }, [t]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const rows = await listActions({ limit: PAGE, beforeId: items[items.length - 1].id });
      setItems(prev => [...prev, ...rows]);
      setMore(rows.length === PAGE);
    } catch (err) {
      setError(errorOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-stack">
      <p className="adm-hint">{t('adm_journal_intro')}</p>
      {error && <p className="st-note" data-tone="error">{error}</p>}
      {items === null ? <div className="adm-loading"><Spinner size={18} /></div> : items.length === 0 ? (
        <p className="adm-empty">{t('adm_no_actions')}</p>
      ) : (
        <section className="adm-panel">
          <ul className="adm-log">{items.map(a => <ActionLine key={a.id} action={a} />)}</ul>
          {more && <div className="adm-actions"><RetroButton disabled={busy} onClick={loadMore}>{t('adm_load_more')}</RetroButton></div>}
        </section>
      )}
    </div>
  );
}
