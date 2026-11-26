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
