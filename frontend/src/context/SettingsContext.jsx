// src/context/SettingsContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const SettingsContext = createContext(null);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
};

// ── Valeurs par défaut ────────────────────────────────────────────
const DEFAULTS = {
  // Jeu
  difficulty:        'medium',   // beginner | easy | medium | hard
  turnDuration:      0,          // secondes — 0 = illimité
  showScorePreview:  true,       // afficher le score provisoire
  showRemainingTiles: true,      // afficher les tuiles restantes
  showBonusLabels:   true,       // afficher 2M / 3L etc. sur le plateau
  autoSortRack:      false,      // trier le rack alphabétiquement
  confirmValidation: false,      // demander confirmation avant valider
  // Interface
  boardSize:         'normal',   // normal | large (pour accessibilité)
  animationsEnabled: true,       // animations et transitions
};

const TURN_OPTIONS = [
  { value: 0,   label: 'Illimité',    short: '∞' },
  { value: 60,  label: '1 minute',    short: '1:00' },
  { value: 120, label: '2 minutes',   short: '2:00' },
  { value: 180, label: '3 minutes',   short: '3:00' },
  { value: 300, label: '5 minutes',   short: '5:00' },
];

const DIFFICULTY_META = {
  beginner: { label: 'Débutant', emoji: '🐣', desc: 'Mots très courts, beaucoup d\'erreurs', color: 'var(--text-muted)' },
  easy:     { label: 'Facile',   emoji: '🟢', desc: 'Mots courts, ignore les cases bonus',    color: 'var(--olive)' },
  medium:   { label: 'Moyen',    emoji: '🟡', desc: 'Équilibré, utilise quelques bonus',       color: 'var(--gold)' },
  hard:     { label: 'Expert',   emoji: '🔴', desc: 'Maximise chaque score, tous les bonus',   color: 'var(--brick)' },
};

const STORAGE_KEY = 'scrabble-settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  // Persister à chaque changement
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateMany = useCallback((patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULTS);
  }, []);

  return (
    <SettingsContext.Provider value={{
      settings,
      update,
      updateMany,
      reset,
      TURN_OPTIONS,
      DIFFICULTY_META,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}