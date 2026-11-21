// src/context/ThemeContext.jsx
// Deux réglages indépendants :
//   • le MODE    (light / dark / system)  → attribut data-theme sur <html>
//   • la PALETTE (vintage, classique, …)  → attribut data-palette sur <html>
// Chaque palette existe en clair et en sombre (voir styles/palettes.css).
//
// Persistance :
//   • localStorage (immédiat, aussi pour les invités ; lu par le script
//     anti-flash d'index.html)
//   • préférences du compte (clés themeMode / colorPalette, via SettingsContext)
//     → le choix suit l'utilisateur d'un appareil à l'autre.
//   À la connexion : si le compte a déjà un choix, il s'applique ; sinon le
//   choix local de l'appareil est envoyé au compte.
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './SettingsContext';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return ctx;
};

// Clés partagées avec le script anti-flash d'index.html : ne pas les renommer
// sans mettre ce script à jour.
const STORAGE_KEY         = 'scrabble-theme';
const PALETTE_STORAGE_KEY = 'scrabble-palette';

const THEMES = ['light', 'dark', 'system'];

/**
 * Ordre d'affichage des palettes. La première est la palette par défaut.
 * Doit rester aligné sur COLOR_PALETTES (backend/app/users/router.py).
 */
const PALETTES = [
  'vintage', 'classique', 'ocean', 'bordeaux', 'ardoise',
  'lavande', 'foret', 'terracotta', 'tournesol', 'contraste',
];
const DEFAULT_PALETTE = PALETTES[0];

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* navigation privée : on ignore */ }
}

/**
 * Détermine le mode effectif appliqué au document.
 * Si 'system', suit prefers-color-scheme.
 */
function resolveTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference, palette) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(preference));
  root.setAttribute('data-palette', palette);

  // Barre d'état du navigateur mobile : on reprend le fond de page de la palette
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const bg = getComputedStyle(root).getPropertyValue('--bg-page').trim();
    if (bg) metaTheme.setAttribute('content', bg);
  }
}

export function ThemeProvider({ children }) {
  const { settings, update, currentUid, serverLoadedFor } = useSettings();

  const [preference, setPreference] = useState(() => {
    const stored = readStored(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  });

  const [palette, setPaletteState] = useState(() => {
    const stored = readStored(PALETTE_STORAGE_KEY);
    return PALETTES.includes(stored) ? stored : DEFAULT_PALETTE;
  });

  // Appliquer au montage et à chaque changement de mode ou de palette
  useEffect(() => {
    applyTheme(preference, palette);
  }, [preference, palette]);

  // Écouter les changements système quand preference === 'system'
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system', palette);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference, palette]);

  // ── Choix de l'utilisateur : local + compte ───────────────────────
  // (update ne contacte le serveur que si quelqu'un est connecté)

  const setTheme = useCallback((newTheme) => {
    if (!THEMES.includes(newTheme)) return;
    writeStored(STORAGE_KEY, newTheme);
    setPreference(newTheme);
    update('themeMode', newTheme);
  }, [update]);

  const setPalette = useCallback((newPalette) => {
    if (!PALETTES.includes(newPalette)) return;
    writeStored(PALETTE_STORAGE_KEY, newPalette);
    setPaletteState(newPalette);
    update('colorPalette', newPalette);
  }, [update]);

  // ── À la connexion : réconcilier avec les préférences du compte ────
  // Une seule fois par chargement serveur (serverLoadedFor change), pour ne
  // jamais écraser un choix fait ensuite sur cet appareil. La ref donne les
  // valeurs du moment sans relancer l'effet à chaque changement.
  const latest = useRef(null);
  useEffect(() => {
    latest.current = { settings, preference, palette };
  });

  useEffect(() => {
    if (!serverLoadedFor || serverLoadedFor !== currentUid || !latest.current) return;
    const { settings: s, preference: localMode, palette: localPalette } = latest.current;

    if (THEMES.includes(s.themeMode)) {
      if (s.themeMode !== localMode) {
        writeStored(STORAGE_KEY, s.themeMode);
        setPreference(s.themeMode);
      }
    } else {
      update('themeMode', localMode);          // compte sans choix : on y envoie celui de l'appareil
    }

    if (PALETTES.includes(s.colorPalette)) {
      if (s.colorPalette !== localPalette) {
        writeStored(PALETTE_STORAGE_KEY, s.colorPalette);
        setPaletteState(s.colorPalette);
      }
    } else {
      update('colorPalette', localPalette);
    }
  }, [serverLoadedFor, currentUid, update]);

  const cycleTheme = useCallback(() => {
    const next = THEMES[(THEMES.indexOf(preference) + 1) % THEMES.length];
    setTheme(next);
  }, [preference, setTheme]);

  const resolvedTheme = resolveTheme(preference);

  return (
    <ThemeContext.Provider value={{
      preference, resolvedTheme, setTheme, cycleTheme, THEMES,
      palette, setPalette, PALETTES,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
