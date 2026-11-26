// src/pages/PrivacyPage.jsx
// Politique de confidentialité (lot 7 — Loi 25). Page publique : #/privacy.
// Texte d'origine : src/i18n/privacy.js (FR / EN). Depuis le lot A2, un
// administrateur peut publier une autre version depuis le dashboard : elle
// remplace alors le texte d'origine (texte brut, aucun HTML interprété).
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { privacy, PRIVACY_CONTACT } from '../i18n/privacy';
import { getPublicPrivacyPolicy } from '../api/configService';
import { fromDocument } from '../utils/privacyDoc';

export default function PrivacyPage() {
  const { language, t } = useLanguage();
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPublicPrivacyPolicy()
      .then(r => { if (!cancelled && r.custom && r.document) setCustom(r.document); })
      .catch(() => { /* serveur indisponible : texte d'origine */ });
    return () => { cancelled = true; };
  }, []);

  const p = custom ? fromDocument(custom, language, t) : (privacy[language] ?? privacy.fr);

  return (
    <div className="s-page">
      <article className="pv-page">
        <header className="pv-head">
          <h1 className="pv-title">{p.title}</h1>
          <p className="pv-updated">{p.updated}</p>
          <p className="pv-intro">{p.intro}</p>
        </header>

        {p.sections.map((section, i) => (
          <section key={`${i}-${section.title}`} className="pv-section" data-warning={section.warning || undefined}>
            <h2 className="pv-h2">{section.warning ? '⚠️ ' : ''}{section.title}</h2>
            {section.paragraphs?.map((text, j) => <p key={j} className="pv-p">{text}</p>)}
            {section.items?.length > 0 && (
              <ul className="pv-list">
                {section.items.map((text, j) => <li key={j}>{text}</li>)}
              </ul>
            )}
          </section>
        ))}

        <section className="pv-section">
          <h2 className="pv-h2">{p.contactLabel}</h2>
          <p className="pv-p">
            {PRIVACY_CONTACT
              ? <a className="acc-link" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>
              : p.contactFallback}
          </p>
        </section>
      </article>
    </div>
  );
}
