// src/api/economyService.js
// Abonnements et crédits (dashboard admin, lot A3), côté joueur.

import { api } from './axiosInstance';

/** Niveaux d'abonnement (public) : de quoi dessiner les badges. */
export const getTiers = async () => (await api.get('/economy/tiers')).data;

/** Gains, prix des indices, palettes premium (public). */
export const getEconomyRules = async () => (await api.get('/economy/rules')).data;

/** { credits, tier_id, tier_expires_at, unlocked_palettes, earned_today_games, transactions } */
export const getWallet = async () => (await api.get('/economy/me')).data;

export const getMyTransactions = async ({ limit = 30, beforeId = null } = {}) =>
  (await api.get('/economy/me/transactions', { params: { limit, ...(beforeId ? { before_id: beforeId } : {}) } })).data;

/** Débloque une palette premium ; retourne le portefeuille à jour. */
export const unlockPalette = async (key) =>
  (await api.post('/economy/me/unlocks', { item_type: 'palette', item_key: key })).data;

/**
 * Indice en partie solo : { hint: { placements, word, score } | null, charged, repeat,
 * credits, hints_used, hints_left }. Route /game (hors /api/v2), avec le jeton du joueur.
 */
export const getHint = async (gameId, playerId) =>
  (await api.post(`/game/hint/${gameId}`, null, {
    baseURL: api.defaults.baseURL.replace(/\/api\/v2\/?$/, ''),
    params: { player_id: playerId },
    timeout: 20000,
  })).data;
