// src/context/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return ctx;
};

const STORAGE_KEY = 'scrabble-theme';
const THEMES = ['light', 'dark', 'system'];

/**
 * Détermine le thème effectif appliqué au document.
 * Si 'system', suit prefers-color-scheme.
 */
function resolveTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  // Pour la meta theme-color du navigateur mobile
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'dark' ? '#1A1510' : '#F5EDD6');
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  });

  // Appliquer le thème au montage et à chaque changement de préférence
  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // Écouter les changements système quand preference === 'system'
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const setTheme = useCallback((newTheme) => {
    if (!THEMES.includes(newTheme)) return;
    localStorage.setItem(STORAGE_KEY, newTheme);
    setPreference(newTheme);
  }, []);

  const cycleTheme = useCallback(() => {
    const next = THEMES[(THEMES.indexOf(preference) + 1) % THEMES.length];
    setTheme(next);
  }, [preference, setTheme]);

  const resolvedTheme = resolveTheme(preference);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setTheme, cycleTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}