// src/components/admin/adminUtils.js
// Petits utilitaires partagés par les écrans du dashboard admin (pas de JSX ici).

export const errorOf = (err, t) => err?.response?.data?.detail || t('adm_error');

const LOCALES = { fr: 'fr-CA', en: 'en-CA' };

export const formatDate = (iso, language, withTime = true) => {
  if (!iso) return '—';
  const opts = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat(LOCALES[language] ?? language, opts).format(new Date(iso));
};

export const formatNumber = (n, language) =>
  new Intl.NumberFormat(LOCALES[language] ?? language).format(n ?? 0);

/** « il y a 3 h », « in 2 days »… */
export const formatRelative = (iso, language) => {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALES[language] ?? language, { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), 'second');
};

export const isMuted = (user) => !!user?.chat_muted_until && new Date(user.chat_muted_until) > new Date();

/** Navigation interne au dashboard (#/admin/…). */
export const goAdmin = (path = '') => { window.location.hash = `#/admin${path ? `/${path}` : ''}`; };
