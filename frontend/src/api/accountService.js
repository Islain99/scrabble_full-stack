// src/api/accountService.js
// Mon compte (lot 7) : export des données, suppression du compte, appareils
// inscrits aux notifications push. Les erreurs axios sont propagées.

import { api } from './axiosInstance';

/** Toutes mes données (objet JSON, voir GET /users/me/export). */
export const exportMyData = async () => (await api.get('/users/me/export')).data;

/** Suppression définitive : il faut retaper son pseudo. */
export const deleteMyAccount = async (confirmName) => {
  await api.delete('/users/me', { data: { confirm_name: confirmName } });
};

/** Profil à jour (statistiques, cote Elo). */
export const getMe = async () => (await api.get('/users/me')).data;

// ── Notifications push ────────────────────────────────────────────
export const registerPushToken = async (token, platform, locale) => {
  await api.post('/push/tokens', { token, platform, locale });
};
export const removePushToken = async (token) => {
  await api.delete('/push/tokens', { data: { token } });
};
/** Notification d'essai → { devices } (nombre d'appareils inscrits). */
export const sendTestPush = async () => (await api.post('/push/test')).data;
