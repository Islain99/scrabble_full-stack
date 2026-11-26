// src/context/AppConfigContext.jsx
//
// Paramètres fixés par l'administrateur (dashboard, lot A2).
//   1. Au démarrage : dernière politique gardée par l'appareil (aucun délai)
//   2. Puis GET /config, et de nouveau toutes les 5 minutes et au retour sur l'onglet
// Le serveur applique aussi la politique : ce contexte sert à l'affichage
// (réglages masqués, grisés, options retirées) et aux choix faits hors connexion.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPublicConfig } from '../api/configService';
import { readCachedPolicy, ruleOf, writeCachedPolicy } from '../utils/appConfig';

const AppConfigContext = createContext(null);

const REFRESH_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;              // pas plus d'une requête toutes les 30 s (focus répétés)

export function AppConfigProvider({ children }) {
  const [policy, setPolicy] = useState(readCachedPolicy);
  const lastFetch = useRef(0);

  const reload = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return;
    lastFetch.current = Date.now();
    try {
      const config = await getPublicConfig();
      writeCachedPolicy(config);
      setPolicy(config.settings ?? null);
    } catch {
      /* hors ligne ou serveur indisponible : la politique gardée reste valable */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => reload(true), 0);
    const id = setInterval(() => reload(true), REFRESH_MS);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(first); clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [reload]);

  const value = useMemo(() => ({
    policy,
    reload,
    rule: (key) => ruleOf(policy, key),
    isHidden: (key) => ruleOf(policy, key).mode === 'hidden',
    isLocked: (key) => ruleOf(policy, key).mode === 'locked',
  }), [policy, reload]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export const useAppConfig = () => {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig doit être utilisé dans <AppConfigProvider>');
  return ctx;
};

/** Variante sans erreur hors du provider (null) : contextes de base, bancs d'essai. */
export const useAppConfigOptional = () => useContext(AppConfigContext);
