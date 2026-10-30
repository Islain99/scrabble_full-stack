// src/pages/PrivacyPage.jsx
// Politique de confidentialité (lot 7 — Loi 25). Page publique : #/privacy.
// Le texte vit dans src/i18n/privacy.js (FR / EN).
import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { privacy, PRIVACY_CONTACT } from '../i18n/privacy';

export default function PrivacyPage() {
  const { language } = useLanguage();
  const p = privacy[language] ?? privacy.fr;

  return (
    <div className="s-page">
      <article className="pv-page">
        <header className="pv-head">
          <h1 className="pv-title">{p.title}</h1>
          <p className="pv-updated">{p.updated}</p>
          <p className="pv-intro">{p.intro}</p>
        </header>

        {p.sections.map(section => (
          <section key={section.title} className="pv-section" data-warning={section.warning || undefined}>
            <h2 className="pv-h2">{section.warning ? '⚠️ ' : ''}{section.title}</h2>
            {section.paragraphs?.map(text => <p key={text} className="pv-p">{text}</p>)}
            {section.items && (
              <ul className="pv-list">
                {section.items.map(text => <li key={text}>{text}</li>)}
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
