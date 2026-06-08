import React, {
  createContext, useContext, useRef, useCallback,
  useState, useEffect,
} from 'react';

// ── Contexte ─────────────────────────────────────────────────────

const TutorialContext = createContext(null);

// ── Définition des conditions par étape ──────────────────────────
// Chaque condition reçoit le snapshot de l'état de jeu exposé par
// notifyGameState(). Retourner true = l'overlay avance automatiquement.
// null = pas de condition (bouton « Suivant » classique).

const STEP_CONDITIONS = {
  // Étape 4 : chevalet — l'utilisateur doit poser au moins 1 tuile
  4: (snap) => snap.placementsCount > 0,
  // Étape 6 : valider — l'utilisateur doit avoir validé au moins 1 mot
  //           (on détecte via l'augmentation du compteur de turns joués)
  6: (snap) => snap.validatedTurns > 0,
};

// ── Provider ─────────────────────────────────────────────────────

export function TutorialProvider({ children }) {
  // ── Registre des refs ───────────────────────────────────────────
  const refsMap = useRef(new Map()); // Map<string, React.RefObject>

  const registerRef = useCallback((id, ref) => {
    refsMap.current.set(id, ref);
  }, []);

  const getRef = useCallback((id) => {
    return refsMap.current.get(id) ?? null;
  }, []);

  // ── État du tutoriel ────────────────────────────────────────────
  const STORAGE_KEY = 'scrabble-tutorial-seen';

  const [isOpen, setIsOpen]   = useState(false);
  const [step, setStep]       = useState(0);
  const [hasSeen, setHasSeen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  // Snapshot de l'état jeu pour les conditions (mis à jour via notifyGameState)
  const gameSnap = useRef({ placementsCount: 0, validatedTurns: 0 });

  // Auto-open à la première visite
  useEffect(() => {
    if (!hasSeen) {
      const t = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vérification des conditions (polling léger) ─────────────────
  // S'active seulement quand le tutoriel est ouvert et qu'il y a
  // une condition pour l'étape courante.
  useEffect(() => {
    if (!isOpen) return;
    const condition = STEP_CONDITIONS[step];
    if (!condition) return;

    const interval = setInterval(() => {
      if (condition(gameSnap.current)) {
        clearInterval(interval);
        // Petit délai pour que l'utilisateur voit ce qu'il vient de faire
        setTimeout(() => {
          setStep(s => {
            const TOTAL_STEPS = 9; // nombre d'étapes (0..8)
            return s < TOTAL_STEPS - 1 ? s + 1 : s;
          });
        }, 600);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [isOpen, step]);

  // ── Actions publiques ───────────────────────────────────────────
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
    setStep(s => (s < totalSteps - 1 ? s + 1 : s));
  }, []);

  const prevStep = useCallback(() => {
    setStep(s => Math.max(0, s - 1));
  }, []);

  /**
   * Appelé depuis GamePage à chaque render significatif.
   * Permet aux conditions de s'évaluer sans couplage direct.
   *
   * @param {{ placementsCount: number, validatedTurns: number }} snap
   */
  const notifyGameState = useCallback((snap) => {
    gameSnap.current = snap;
  }, []);

  // ── Valeur du contexte ──────────────────────────────────────────
  const value = {
    // Refs
    registerRef,
    getRef,
    // État tutoriel
    isOpen,
    step,
    hasSeenTutorial: hasSeen,
    // Actions
    openTutorial,
    closeTutorial,
    nextStep,
    prevStep,
    // Conditions
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

/**
 * Accès complet au contexte tutoriel.
 * À utiliser dans TutorialOverlay, TutorialButton, GamePage.
 */
export function useTutorialContext() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorialContext doit être utilisé dans <TutorialProvider>');
  return ctx;
}

/**
 * Enregistre un élément DOM dans le registre de refs du tutoriel.
 * Retourne la ref à attacher au composant cible.
 *
 * @param {string} id  Identifiant de l'étape (ex: 'tile-rack', 'board')
 * @returns {React.RefObject<HTMLElement>}
 *
 * @example
 *   const rackRef = useTutorialRef('tile-rack');
 *   <div ref={rackRef}>...</div>
 */
export function useTutorialRef(id) {
  const { registerRef } = useTutorialContext();
  const ref = useRef(null);

  useEffect(() => {
    registerRef(id, ref);
    // Pas de cleanup : la ref reste valide tant que le Provider existe.
  }, [id, registerRef]);

  return ref;
}