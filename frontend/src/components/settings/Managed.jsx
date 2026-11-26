// src/components/settings/Managed.jsx
// Paramètres fixés par l'administrateur (lot A2) : mention « fixé » et liste de
// lignes séparées qui saute les lignes masquées.
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

/** « 🔒 Fixé par l'administrateur », sous un contrôle verrouillé. */
export function LockNote() {
  const { t } = useLanguage();
  return (
    <span className="st-lock" role="note">
      <span aria-hidden="true">🔒</span> {t('settings_locked')}
    </span>
  );
}

/** Contrôle + mention si verrouillé ; le contrôle ne reçoit plus les clics. */
export function Managed({ locked, children }) {
  if (!locked) return children;
  return (
    <div className="st-managed" data-locked="">
      <div className="st-managed-ctl" aria-disabled="true" inert>{children}</div>
      <LockNote />
    </div>
  );
}

/** Lignes séparées par un filet ; les lignes `null` (masquées) disparaissent avec leur filet. */
export function RowList({ children }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return rows.map((row, i) => (
    <React.Fragment key={row.key ?? i}>
      {i > 0 && <div style={{ borderTop: '1px solid var(--border-muted)' }} />}
      {row}
    </React.Fragment>
  ));
}
