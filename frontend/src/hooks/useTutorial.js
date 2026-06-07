// src/hooks/useTutorial.js
// Gère l'état du tutoriel interactif.
// Persistance via localStorage : le tutoriel auto ne s'affiche qu'une fois.
// Peut toujours être rouvert manuellement via openTutorial().

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'scrabble-tutorial-seen';

/**
 * @returns {{
 *   isOpen: boolean,
 *   step: number,
 *   totalSteps: number,
 *   openTutorial: () => void,
 *   closeTutorial: () => void,
 *   nextStep: () => void,
 *   prevStep: () => void,
 *   hasSeenTutorial: boolean,
 * }}
 */
export function useTutorial() {
  const [isOpen, setIsOpen]   = useState(false);
  const [step, setStep]       = useState(0);
  const [hasSeen, setHasSeen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  // Déclenchement automatique à la première visite
  useEffect(() => {
    if (!hasSeen) {
      // Petit délai pour laisser le jeu se monter
      const t = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTutorial = useCallback(() => {
    setStep(0);
    setIsOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setIsOpen(false);
    setHasSeen(true);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }, []);

  const nextStep = useCallback((totalSteps) => {
    setStep(s => {
      if (s >= totalSteps - 1) return s;
      return s + 1;
    });
  }, []);

  const prevStep = useCallback(() => {
    setStep(s => Math.max(0, s - 1));
  }, []);

  return {
    isOpen,
    step,
    openTutorial,
    closeTutorial,
    nextStep,
    prevStep,
    hasSeenTutorial: hasSeen,
  };
}