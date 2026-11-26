// src/utils/appConfig.js
//
// Paramètres fixés par l'administrateur (dashboard, lot A2) : fonctions pures
// partagées par les contextes (langue, réglages, thème) et les écrans.
//
// Politique d'un paramètre : { mode, default, options }
//   mode   free   → le joueur choisit (parmi options)
//          locked → visible mais grisé, valeur imposée = default
//          hidden → invisible, valeur imposée = default
//   options        valeurs proposées (null pour un oui / non)
// Sans politique connue (hors ligne, serveur d'avant le lot A2) : tout est libre.

export const CONFIG_CACHE_KEY = 'scrabble-app-config';

const FREE = Object.freeze({ mode: 'free', default: undefined, options: null });

/** Dernière politique reçue, gardée par l'appareil (lecture instantanée au démarrage). */
export function readCachedPolicy() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw)?.settings ?? null : null;
  } catch {
    return null;
  }
}

export function writeCachedPolicy(config) {
  try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config)); } catch { /* stockage indisponible */ }
}

export const ruleOf = (policy, key) => policy?.[key] ?? FREE;
export const isForced = (rule) => rule.mode === 'locked' || rule.mode === 'hidden';

/** Valeur qu'a vraiment le joueur. `fallback` : valeur quand la politique n'impose rien. */
export function effectiveValue(policy, key, chosen, fallback = chosen) {
  const rule = ruleOf(policy, key);
  const hasDefault = rule.default !== undefined && rule.default !== null;
  if (isForced(rule) && hasDefault) return rule.default;
  if (rule.options && !rule.options.includes(chosen)) {
    return hasDefault ? rule.default : (rule.options.includes(fallback) ? fallback : rule.options[0]);
  }
  return chosen;
}

/** Ce que le joueur peut encore choisir (liste complète → liste proposée). */
export function choosable(policy, key, all) {
  const rule = ruleOf(policy, key);
  if (isForced(rule)) return all.filter(v => v === rule.default);
  return rule.options ? all.filter(v => rule.options.includes(v)) : all;
}

/** Le joueur peut-il choisir cette valeur ? */
export function canChoose(policy, key, value) {
  const rule = ruleOf(policy, key);
  if (isForced(rule)) return false;
  return !rule.options || rule.options.includes(value);
}

/** Défauts de l'administrateur (clés de préférences seulement, valeurs non nulles). */
export function policyDefaults(policy) {
  const out = {};
  for (const [key, rule] of Object.entries(policy ?? {})) {
    if (!key.includes('.') && rule.default !== undefined && rule.default !== null) out[key] = rule.default;
  }
  return out;
}

/** Préférences après politique (réglages verrouillés, options retirées). */
export function applyPolicy(policy, settings) {
  if (!policy) return settings;
  const out = { ...settings };
  for (const key of Object.keys(policy)) {
    if (key.includes('.') || !(key in out)) continue;
    out[key] = effectiveValue(policy, key, out[key]);
  }
  return out;
}
