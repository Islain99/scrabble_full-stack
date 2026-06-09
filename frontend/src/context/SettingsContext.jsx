// src/context/SettingsContext.jsx
//
// Stratégie de synchronisation :
//  1. Au montage          → charge depuis localStorage (instantané, hors ligne)
//  2. Après login         → charge depuis le serveur, écrase localStorage
//  3. À chaque changement → sauvegarde dans localStorage (immédiat)
//                        → debounce 800ms → sauvegarde sur le serveur si connecté
//  4. Au logout           → nettoie le localStorage de l'utilisateur courant
//
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getPreferences, savePreferences } from '../api/authService';

const SettingsContext = createContext(null);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
};

// ── Constantes ────────────────────────────────────────────────────

export const DEFAULTS = {
  difficulty:         'medium',
  turnDuration:       0,
  showScorePreview:   true,
  showRemainingTiles: true,
  showBonusLabels:    true,
  autoSortRack:       false,
  confirmValidation:  false,
  boardSize:          'normal',
  animationsEnabled:  true,
  language:           'fr',
  tutorialSeen:       false,
};

export const TURN_OPTIONS = [
  { value: 0,   label: 'Illimité',  short: '∞'    },
  { value: 60,  label: '1 minute',  short: '1 min' },
  { value: 120, label: '2 minutes', short: '2 min' },
  { value: 180, label: '3 minutes', short: '3 min' },
  { value: 300, label: '5 minutes', short: '5 min' },
];

export const DIFFICULTY_META = {
    beginner:   { label: 'Débutant',  emoji: '🐣', desc: "Mots très courts, beaucoup d'erreurs",     color: 'var(--text-muted)' },
    easy:       { label: 'Facile',    emoji: '🟢', desc: 'Mots courts, ignore les cases bonus',       color: 'var(--olive)'     },
    medium:     { label: 'Moyen',     emoji: '🟡', desc: 'Équilibré, utilise quelques bonus',          color: 'var(--gold)'      },
    hard_minus: { label: 'Difficile', emoji: '🟠', desc: "Mots longs, tous les bonus, peu d'erreurs", color: 'var(--orange)'    },
    hard:       { label: 'Expert',    emoji: '🔴', desc: 'Maximise chaque score, tous les bonus',      color: 'var(--brick)'     },
};

// ── Clé localStorage par utilisateur ─────────────────────────────

function storageKey(uid) {
  return uid ? `scrabble-settings-${uid}` : 'scrabble-settings-guest';
}

function loadFromStorage(uid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function persistToStorage(uid, settings) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(settings));
  } catch {}
}

function clearGuestStorage() {
  try {
    localStorage.removeItem('scrabble-settings-guest');
  } catch {}
}

// ── Provider ──────────────────────────────────────────────────────

export function SettingsProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [settings, setSettings]     = useState(() => loadFromStorage(null));
  const [syncing, setSyncing]        = useState(false);
  const [lastSynced, setLastSynced]  = useState(null);
  const debounceRef = useRef(null);

  // ── Observer Firebase auth — indépendant d'AuthContext ───────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        setCurrentUid(uid);

        // 1. Charger préférences locales (immédiat, pas de flash)
        const local = loadFromStorage(uid);
        setSettings(local);

        // 2. Charger depuis le serveur (peut prendre quelques ms)
        try {
          const serverPrefs = await getPreferences();
          const merged = { ...DEFAULTS, ...serverPrefs };
          setSettings(merged);
          persistToStorage(uid, merged);
          setLastSynced(new Date());
        } catch (err) {
          console.warn('Préférences serveur indisponibles, cache local utilisé:', err.message);
        }

        // 3. Nettoyer les préférences invité
        clearGuestStorage();
      } else {
        // Logout
        setCurrentUid(null);
        setLastSynced(null);
        setSettings(loadFromStorage(null));
      }
    });

    return unsubscribe;
  }, []);

  // ── Persistance locale à chaque changement ────────────────────
  useEffect(() => {
    persistToStorage(currentUid, settings);
  }, [settings, currentUid]);

  // ── Sync serveur debounced ────────────────────────────────────
  const syncToServer = useCallback((patch) => {
    if (!currentUid) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSyncing(true);
      try {
        await savePreferences(patch);
        setLastSynced(new Date());
      } catch (err) {
        console.warn('Sync préférences échouée:', err.message);
      } finally {
        setSyncing(false);
      }
    }, 800);
  }, [currentUid]);

  const update = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    syncToServer({ [key]: value });
  }, [syncToServer]);

  const updateMany = useCallback((patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
    syncToServer(patch);
  }, [syncToServer]);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULTS });
    syncToServer(DEFAULTS);
  }, [syncToServer]);

  return (
    <SettingsContext.Provider value={{
      settings,
      update,
      updateMany,
      reset,
      syncing,
      lastSynced,
      currentUid,
      TURN_OPTIONS,
      DIFFICULTY_META,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}