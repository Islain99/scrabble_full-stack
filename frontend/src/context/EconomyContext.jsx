// src/context/EconomyContext.jsx
//
// Abonnements et crédits (lot A3) : niveaux (badges), règles publiques, et pour un
// joueur connecté son portefeuille (solde, niveau, palettes débloquées).
// Sous AuthProvider : le portefeuille suit la connexion.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getEconomyRules, getTiers, getWallet, unlockPalette as unlockPaletteApi } from '../api/economyService';

const EconomyContext = createContext(null);
const CACHE_KEY = 'scrabble-economy-public';

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {}; } catch { return {}; }
}

export function EconomyProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [publicData, setPublicData] = useState(readCache);     // { tiers, rules }
  const [wallet, setWallet] = useState(null);

  const loadPublic = useCallback(async () => {
    try {
      const [tiers, rules] = await Promise.all([getTiers(), getEconomyRules()]);
      setPublicData({ tiers, rules });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tiers, rules })); } catch { /* stockage indisponible */ }
    } catch { /* hors ligne : on garde le cache */ }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!isAuthenticated) { setWallet(null); return null; }
    try {
      const w = await getWallet();
      setWallet(w);
      return w;
    } catch {
      return null;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const id = setTimeout(loadPublic, 0);
    const every = setInterval(loadPublic, 5 * 60 * 1000);
    return () => { clearTimeout(id); clearInterval(every); };
  }, [loadPublic]);

  // Connexion / changement de compte : portefeuille à jour (bonus quotidien compris)
  const userId = user?.id ?? null;
  useEffect(() => {
    const id = setTimeout(() => { refreshWallet(); }, 0);
    return () => clearTimeout(id);
  }, [refreshWallet, userId]);

  const unlockPalette = useCallback(async (key) => {
    const w = await unlockPaletteApi(key);
    setWallet(w);
    return w;
  }, []);

  /** Solde renvoyé par une autre route (indice) : mise à jour sans requête. */
  const setCredits = useCallback((credits) => {
    setWallet(w => (w ? { ...w, credits } : w));
  }, []);

  const value = useMemo(() => {
    const tiers = publicData.tiers ?? [];
    const rules = publicData.rules ?? null;
    const premium = rules?.enabled === false ? {} : (rules?.premium_palettes ?? {});
    const owned = new Set(wallet?.unlocked_palettes ?? []);
    const lockedPalettes = new Set(Object.keys(premium).filter(k => !owned.has(k)));
    const defaultTier = tiers.find(t => t.is_default) ?? null;
    return {
      tiers,
      rules,
      wallet,
      credits: wallet?.credits ?? null,
      premiumPalettes: premium,
      lockedPalettes,
      /** Niveau à afficher pour un id (null = niveau par défaut). */
      tierOf: (id) => (id == null ? defaultTier : tiers.find(t => t.id === id) ?? defaultTier),
      refreshWallet,
      reloadPublic: loadPublic,
      unlockPalette,
      setCredits,
    };
  }, [publicData, wallet, refreshWallet, loadPublic, unlockPalette, setCredits]);

  return <EconomyContext.Provider value={value}>{children}</EconomyContext.Provider>;
}

export const useEconomy = () => {
  const ctx = useContext(EconomyContext);
  if (!ctx) throw new Error('useEconomy doit être utilisé dans <EconomyProvider>');
  return ctx;
};

/** Variante sans erreur hors du provider (null). */
export const useEconomyOptional = () => useContext(EconomyContext);
