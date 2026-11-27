// src/api/adminService.js
// Dashboard administrateur (lot A1). Toutes les routes exigent un compte is_admin
// (403 sinon). Les erreurs axios sont propagées.

import { api } from './axiosInstance';

/** Chiffres clés + séries quotidiennes ; days ∈ 7 | 30 | 90. */
export const getOverview = async (days = 30) => (await api.get('/admin/overview', { params: { days } })).data;

/** { items, total, page, page_size } — q, status (all|active|disabled|admin|muted), sort, page, page_size. */
export const listUsers = async (params = {}) => (await api.get('/admin/users', { params })).data;

export const getUser = async (id) => (await api.get(`/admin/users/${id}`)).data;

/** patch : { is_active?, is_admin?, display_name?, reason? } → fiche à jour. */
export const updateUser = async (id, patch) => (await api.patch(`/admin/users/${id}`, patch)).data;

/** Journal des actions, du plus récent au plus ancien. */
export const listActions = async ({ limit = 50, beforeId = null } = {}) =>
  (await api.get('/admin/actions', { params: { limit, ...(beforeId ? { before_id: beforeId } : {}) } })).data;

// Sourdine dans la messagerie : route existante du lot 6 (0 = lever la sourdine)
export { muteUser } from './chatService';

// ── Lot A2 : paramètres globaux et politique de confidentialité ──

/** { catalog, policy, custom, updated_at, updated_by_name } */
export const getSettingsPolicy = async () => (await api.get('/admin/settings')).data;

/** policy : { clé: { mode, default, options } } — retourne la politique enregistrée (+ privacy_updates). */
export const saveSettingsPolicy = async (policy, note) =>
  (await api.put('/admin/settings', { settings: policy, ...(note ? { note } : {}) })).data;

export const resetSettingsPolicy = async () => (await api.delete('/admin/settings')).data;

/** { custom, document, updated_at, updated_by_name } */
export const getPrivacyPolicy = async () => (await api.get('/admin/privacy-policy')).data;

export const savePrivacyPolicy = async (document) => (await api.put('/admin/privacy-policy', document)).data;

export const resetPrivacyPolicy = async () => (await api.delete('/admin/privacy-policy')).data;

// ── Lot A3 : abonnements et crédits ──────────────────────────────

/** Niveaux avec leur nombre d'abonnés en vigueur. Les modifications renvoient la liste à jour. */
export const getAdminTiers = async () => (await api.get('/admin/tiers')).data;
export const createTier = async (tier) => (await api.post('/admin/tiers', tier)).data;
export const updateTier = async (id, patch) => (await api.patch(`/admin/tiers/${id}`, patch)).data;
export const deleteTier = async (id) => (await api.delete(`/admin/tiers/${id}`)).data;

/** tierId null = niveau par défaut ; expiresAt (ISO) null = sans date de fin. Retourne la fiche. */
export const assignTier = async (userId, { tierId, expiresAt, reason }) =>
  (await api.put(`/admin/users/${userId}/tier`, { tier_id: tierId, expires_at: expiresAt, reason })).data;

/** amount > 0 crédite, < 0 débite ; motif obligatoire. Retourne la fiche. */
export const adjustCredits = async (userId, amount, reason) =>
  (await api.post(`/admin/users/${userId}/credits`, { amount, reason })).data;

export const getUserTransactions = async (userId, { limit = 20, beforeId = null } = {}) =>
  (await api.get(`/admin/users/${userId}/transactions`, { params: { limit, ...(beforeId ? { before_id: beforeId } : {}) } })).data;

export const getAllTransactions = async ({ kind = null, limit = 50, beforeId = null } = {}) =>
  (await api.get('/admin/transactions', { params: { limit, ...(kind ? { kind } : {}), ...(beforeId ? { before_id: beforeId } : {}) } })).data;

/** { rules, custom, updated_at, updated_by_name, stats, kept_unlocks } */
export const getEconomyAdmin = async () => (await api.get('/admin/economy')).data;
export const saveEconomyRules = async (rules, note) =>
  (await api.put('/admin/economy', { ...rules, ...(note ? { note } : {}) })).data;
export const resetEconomyRules = async () => (await api.delete('/admin/economy')).data;

// ── Lot A4 : messagerie, profil, publications ────────────────────

/** { rules, builtin_words, custom, updated_at, updated_by_name, slow_mode_s, stats, muted } */
export const getChatAdmin = async () => (await api.get('/admin/chat')).data;
export const saveChatRules = async (rules, note) => (await api.put('/admin/chat', { ...rules, ...(note ? { note } : {}) })).data;
export const resetChatRules = async () => (await api.delete('/admin/chat')).data;
// Signalements et mode lent : routes de la messagerie (lot 6)
export { listReports, resolveReport, setSlowMode } from './chatService';

/** { rules, fields, custom, updated_at, updated_by_name, stats, recomputed } */
export const getProfileFields = async () => (await api.get('/admin/profile-fields')).data;
export const saveProfileFields = async (rules, note) =>
  (await api.put('/admin/profile-fields', { ...rules, ...(note ? { note } : {}) })).data;
export const resetProfileFields = async () => (await api.delete('/admin/profile-fields')).data;

/** { items, devices, news_opt_out } ; status : draft | published | archived */
export const listAnnouncementsAdmin = async (status = null) =>
  (await api.get('/admin/announcements', { params: status ? { status } : {} })).data;
export const createAnnouncement = async (ann) => (await api.post('/admin/announcements', ann)).data;
export const updateAnnouncement = async (id, ann) => (await api.patch(`/admin/announcements/${id}`, ann)).data;
export const publishAnnouncement = async (id) => (await api.post(`/admin/announcements/${id}/publish`)).data;
export const archiveAnnouncement = async (id) => (await api.post(`/admin/announcements/${id}/archive`)).data;
export const deleteAnnouncement = async (id) => { await api.delete(`/admin/announcements/${id}`); };
