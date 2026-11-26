// src/utils/privacyDoc.js
// Politique de confidentialité publiée par l'administrateur (lot A2) → même forme
// que le texte d'origine (src/i18n/privacy.js), pour la page #/privacy et l'aperçu
// du dashboard.

const LOCALES = { fr: 'fr-CA', en: 'en-CA' };

export function formatPolicyDate(isoDate, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? language, { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${isoDate}T12:00:00Z`));
}

export function fromDocument(doc, language, t) {
  const p = doc[language] ?? doc.fr;
  return { ...p, updated: t('privacy_updated_on', { date: formatPolicyDate(doc.updated_on, language) }) };
}
