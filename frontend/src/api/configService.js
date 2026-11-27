// src/api/configService.js
// Configuration publique (dashboard admin, lot A2) : lisible sans être connecté.

import { api } from './axiosInstance';

/** { settings: { clé: { mode, default, options } }, updated_at } */
export const getPublicConfig = async () => (await api.get('/config')).data;

/** { custom, document, updated_at } — custom: false → texte livré avec l'application. */
export const getPublicPrivacyPolicy = async () => (await api.get('/config/privacy-policy')).data;

/** Lot A4 : champs du profil { fields: { nom: { collect, public } }, min_age }. */
export const getProfileRules = async () => (await api.get('/config/profile')).data;
