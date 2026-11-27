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
import { useAppConfigOptional } from './AppConfigContext';
import { useEconomyOptional } from './EconomyContext';
import { canChoose, choosable, effectiveValue, isForced, readCachedPolicy, ruleOf } from '../utils/appConfig';

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

const NO_LOCK = new Set();

export function ThemeProvider({ children }) {
  const { settings, update, currentUid, serverLoadedFor } = useSettings();

  // Choix de l'appareil ; sans choix enregistré : défaut de l'administrateur (lot A2)
  const [chosenMode, setPreference] = useState(() => {
    const stored = readStored(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : (ruleOf(readCachedPolicy(), 'themeMode').default ?? 'system');
  });

  const [chosenPalette, setPaletteState] = useState(() => {
    const stored = readStored(PALETTE_STORAGE_KEY);
    return PALETTES.includes(stored) ? stored : (ruleOf(readCachedPolicy(), 'colorPalette').default ?? DEFAULT_PALETTE);
  });

  // Lot A2 : mode / palette imposés ou options retirées par l'administrateur
  const policy = useAppConfigOptional()?.policy ?? null;
  const preference = effectiveValue(policy, 'themeMode', chosenMode, 'system');
  // Lot A3 : palettes premium pas encore débloquées (toutes, pour un invité)
  const lockedPalettes = useEconomyOptional()?.lockedPalettes ?? NO_LOCK;
  const policyPalette = ruleOf(policy, 'colorPalette').default ?? null;
  let palette = effectiveValue(policy, 'colorPalette', chosenPalette, DEFAULT_PALETTE);
  if (lockedPalettes.has(palette) && palette !== policyPalette) {
    // Palette premium non débloquée → défaut de l'admin, sinon la première gratuite
    palette = [policyPalette, DEFAULT_PALETTE, ...PALETTES].find(p => p && !lockedPalettes.has(p)) ?? DEFAULT_PALETTE;
  }
  const themes = choosable(policy, 'themeMode', THEMES);
  const palettes = choosable(policy, 'colorPalette', PALETTES);
  const themeLocked = isForced(ruleOf(policy, 'themeMode'));
  const paletteLocked = isForced(ruleOf(policy, 'colorPalette'));

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
    if (!THEMES.includes(newTheme) || !canChoose(policy, 'themeMode', newTheme)) return;
    writeStored(STORAGE_KEY, newTheme);
    setPreference(newTheme);
    update('themeMode', newTheme);
  }, [update, policy]);

  // justUnlocked : palette premium que le joueur vient de débloquer (contexte pas encore à jour)
  const setPalette = useCallback((newPalette, { justUnlocked = false } = {}) => {
    if (!PALETTES.includes(newPalette) || !canChoose(policy, 'colorPalette', newPalette)) return;
    if (!justUnlocked && lockedPalettes.has(newPalette) && newPalette !== policyPalette) return;   // à débloquer d'abord
    writeStored(PALETTE_STORAGE_KEY, newPalette);
    setPaletteState(newPalette);
    update('colorPalette', newPalette);
  }, [update, policy, lockedPalettes, policyPalette]);

  // ── À la connexion : réconcilier avec les préférences du compte ────
  // Une seule fois par chargement serveur (serverLoadedFor change), pour ne
  // jamais écraser un choix fait ensuite sur cet appareil. La ref donne les
  // valeurs du moment sans relancer l'effet à chaque changement.
  const latest = useRef(null);
  useEffect(() => {
    latest.current = { settings, preference: chosenMode, palette: chosenPalette };
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
    const next = themes[(themes.indexOf(preference) + 1) % themes.length];
    setTheme(next);
  }, [preference, setTheme, themes]);

  const resolvedTheme = resolveTheme(preference);

  return (
    <ThemeContext.Provider value={{
      // THEMES / PALETTES : ce que le joueur peut choisir (politique de l'administrateur)
      preference, resolvedTheme, setTheme, cycleTheme, THEMES: themes, themeLocked,
      palette, setPalette, PALETTES: palettes, paletteLocked, ALL_PALETTES: PALETTES, lockedPalettes,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
