// src/context/TutorialContext.jsx  (v3 — persistance Firebase + localStorage fallback)
// Remplace entièrement la v2.
//
// Stratégie de persistance :
//   1. Au montage : charger tutorialSeen depuis les préférences serveur
//      (via SettingsContext qui expose `settings.tutorialSeen`)
//   2. À la fermeture : écrire localStorage (immédiat) + PATCH /me/preferences
//      (silencieux, fire-and-forget)
//   3. Si non connecté : localStorage uniquement (comportement identique à v2)

import React, {
  createContext, useContext, useRef, useCallback,
  useState, useEffect,
} from 'react';
import { useAuth } from './AuthContext';
import { savePreferences } from '../api/authService';

// ── Contexte ─────────────────────────────────────────────────────

const TutorialContext = createContext(null);

// ── Conditions par étape ─────────────────────────────────────────
// null = bouton « Suivant » classique
// fn   = avance automatiquement quand retourne true

const STEP_CONDITIONS = {
  4: (snap) => snap.placementsCount > 0,
  6: (snap) => snap.validatedTurns > 0,
};

const STORAGE_KEY  = 'scrabble-tutorial-seen';
const TOTAL_STEPS  = 9;

// ── Provider ─────────────────────────────────────────────────────

export function TutorialProvider({ children, settings }) {
  // `settings` est injecté depuis App.jsx via useSettings()
  // pour éviter une dépendance circulaire entre contextes.
  // settings.tutorialSeen peut être undefined au premier rendu (chargement async).

  const { isAuthenticated } = useAuth();

  // ── Refs ─────────────────────────────────────────────────────
  const refsMap    = useRef(new Map());
  const gameSnap   = useRef({ placementsCount: 0, validatedTurns: 0 });
  const syncedRef  = useRef(false); // évite un double-write au montage

  // ── État ─────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep]     = useState(0);

  // hasSeen : priorité serveur > localStorage
  const [hasSeen, setHasSeen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  // Synchronisation depuis les préférences serveur (chargées de façon async par SettingsContext)
  useEffect(() => {
    if (syncedRef.current) return;
    if (settings?.tutorialSeen === true) {
      setHasSeen(true);
      syncedRef.current = true;
    } else if (settings?.tutorialSeen === false && syncedRef.current === false) {
      // Le serveur dit "pas encore vu" → on s'assure que hasSeen est false
      // (cas : utilisateur sur un nouvel appareil, localStorage absent)
      setHasSeen(false);
      syncedRef.current = true;
    }
  }, [settings?.tutorialSeen]);

  // Auto-open à la première visite (quand hasSeen est établi)
  useEffect(() => {
    if (!syncedRef.current) return; // attendre la résolution
    if (!hasSeen) {
      const t = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [hasSeen, syncedRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vérification des conditions ───────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const condition = STEP_CONDITIONS[step];
    if (!condition) return;

    const interval = setInterval(() => {
      if (condition(gameSnap.current)) {
        clearInterval(interval);
        setTimeout(() => {
          setStep(s => (s < TOTAL_STEPS - 1 ? s + 1 : s));
        }, 600);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [isOpen, step]);

  // ── Persistance ───────────────────────────────────────────────

  const persistSeen = useCallback(async () => {
    // 1. localStorage (immédiat)
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}

    // 2. Firebase via API (fire-and-forget, silencieux)
    if (isAuthenticated) {
      try {
        await savePreferences({ tutorialSeen: true });
      } catch (err) {
        // Non bloquant — le localStorage est le fallback
        console.warn('[Tutorial] Persistance Firebase échouée :', err?.message);
      }
    }
  }, [isAuthenticated]);

  // ── Actions publiques ─────────────────────────────────────────

  const openTutorial = useCallback(() => {
    setStep(0);
    setIsOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setIsOpen(false);
    setHasSeen(true);
    persistSeen();
  }, [persistSeen]);

  const nextStep = useCallback((total = TOTAL_STEPS) => {
    setStep(s => (s < total - 1 ? s + 1 : s));
  }, []);

  const prevStep = useCallback(() => {
    setStep(s => Math.max(0, s - 1));
  }, []);

  const notifyGameState = useCallback((snap) => {
    gameSnap.current = snap;
  }, []);

  // ── Refs ──────────────────────────────────────────────────────

  const registerRef = useCallback((id, ref) => {
    refsMap.current.set(id, ref);
  }, []);

  const getRef = useCallback((id) => {
    return refsMap.current.get(id) ?? null;
  }, []);

  // ── Valeur du contexte ────────────────────────────────────────

  const value = {
    registerRef,
    getRef,
    isOpen,
    step,
    hasSeenTutorial: hasSeen,
    openTutorial,
    closeTutorial,
    nextStep,
    prevStep,
    notifyGameState,
    stepConditions: STEP_CONDITIONS,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

// ── Hooks consommateurs ──────────────────────────────────────────

export function useTutorialContext() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorialContext doit être utilisé dans <TutorialProvider>');
  return ctx;
}

/**
 * Enregistre un élément DOM dans le registre de refs du tutoriel.
 * @param {string} id  ex: 'tile-rack', 'board', 'btn-validate'
 * @returns {React.RefObject<HTMLElement>}
 */
export function useTutorialRef(id) {
  const { registerRef } = useTutorialContext();
  const ref = useRef(null);

  useEffect(() => {
    registerRef(id, ref);
  }, [id, registerRef]);

  return ref;
}