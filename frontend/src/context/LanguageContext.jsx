// src/context/LanguageContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '../i18n/translations';
import { useAppConfigOptional } from './AppConfigContext';
import { canChoose, choosable, effectiveValue, isForced, readCachedPolicy, ruleOf } from '../utils/appConfig';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'scrabble-language';
const SUPPORTED   = ['fr', 'en'];
const IS_DEV      = import.meta.env.DEV;

// Choix de l'appareil, sinon langue du navigateur, sinon défaut de l'administrateur
function detectDefault(policy) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch { /* stockage indisponible (navigation privée, quota) : on continue sans */ }
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  if (SUPPORTED.includes(nav) && canChoose(policy, 'language', nav)) return nav;
  return ruleOf(policy, 'language').default ?? 'fr';
}

export function LanguageProvider({ children }) {
  // Lot A2 : l'administrateur peut imposer la langue ou retirer une option
  const policy = useAppConfigOptional()?.policy ?? null;
  const [chosen, setChosen] = useState(() => detectDefault(readCachedPolicy()));
  const language = effectiveValue(policy, 'language', chosen, 'fr');
  const availableLanguages = choosable(policy, 'language', SUPPORTED);
  const languageLocked = isForced(ruleOf(policy, 'language'));

  const setLanguage = useCallback((lang) => {
    if (SUPPORTED.includes(lang) && canChoose(policy, 'language', lang)) setChosen(lang);
  }, [policy]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, chosen); } catch { /* stockage indisponible (navigation privée, quota) : on continue sans */ }
  }, [chosen]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  /**
   * t(key)               → traduction simple
   * t(key, { n: 3 })     → interpolation {{n}}
   */
  const t = useCallback((key, vars) => {
    const val = translations[language]?.[key] ?? translations['fr']?.[key];

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
   * tp(key, count, vars?)
   * Cherche `key_one` si count === 1, sinon `key_other`.
   * `vars` ajoute d'autres variables : tp('ai_move_swap', 3, { name: 'HAL' }).
   * Supporte aussi l'interpolation : tp('game_tiles', 3) → "3 tuiles"
   * si translations.fr = { game_tiles_one: "{{count}} tuile", game_tiles_other: "{{count}} tuiles" }
   */
  const tp = useCallback((key, count, vars) => {
    const suffix = count === 1 ? '_one' : '_other';
    return t(key + suffix, { ...vars, count });
  }, [t]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tp, SUPPORTED, availableLanguages, languageLocked }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage doit être utilisé dans <LanguageProvider>');
  return ctx;
}
