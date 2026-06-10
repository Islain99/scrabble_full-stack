// src/context/LanguageContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'scrabble-language';
const SUPPORTED   = ['fr', 'en'];
const IS_DEV      = import.meta.env.DEV;

function detectDefault() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {}
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'fr';
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(detectDefault);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  }, [language]);

  /**
   * t(key)               → traduction simple
   * t(key, { n: 3 })     → interpolation {{n}}
   */
  const t = useCallback((key, vars) => {
    const val =
      translations[language]?.[key] ??
      translations['fr']?.[key];

    if (val === undefined) {
      if (IS_DEV) console.warn(`[i18n] Clé manquante : "${key}" (lang="${language}")`);
      return key;
    }

    if (!vars) return val;

    // Interpolation : remplace {{varName}} par la valeur fournie
    return val.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{{${k}}}`
    );
  }, [language]);

  /**
   * tp(key, count)
   * Cherche `key_one` si count === 1, sinon `key_other`.
   * Supporte aussi l'interpolation : tp('game_tiles', 3) → "3 tuiles"
   * si translations.fr = { game_tiles_one: "{{count}} tuile", game_tiles_other: "{{count}} tuiles" }
   */
  const tp = useCallback((key, count) => {
    const suffix = count === 1 ? '_one' : '_other';
    return t(key + suffix, { count });
  }, [t]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tp, SUPPORTED }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage doit être utilisé dans <LanguageProvider>');
  return ctx;
}