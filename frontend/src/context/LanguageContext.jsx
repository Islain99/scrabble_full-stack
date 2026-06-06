// src/context/LanguageContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'scrabble-language';
const SUPPORTED   = ['fr', 'en'];

function detectDefault() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {}
  // Détection navigateur
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'fr';
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(detectDefault);

  // Persiste dans localStorage à chaque changement
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  }, [language]);

  const t = useCallback(
    (key) => translations[language]?.[key] ?? translations['fr']?.[key] ?? key,
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, SUPPORTED }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage doit être utilisé dans <LanguageProvider>');
  return ctx;
}