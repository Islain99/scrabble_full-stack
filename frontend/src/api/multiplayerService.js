// src/api/multiplayerService.js
// Appels REST vers /api/v2/multiplayer/*
// Utilise axiosInstance (token Firebase injecté automatiquement).

import { api } from './axiosInstance';

const BASE = '/multiplayer';

// ── Salles ────────────────────────────────────────────────────────

/** Crée une nouvelle salle. Retourne { room_id, status, host_name, settings } */
// L'erreur axios est propagée telle quelle : la page lit `response.data.detail`
// et affiche sinon un message traduit (mp_create_error).
export const createRoom = async (settings = null) => {
  // Règles choisies par l'hôte (voir RoomSettings côté serveur) ; sans elles : défauts
  const { data } = await api.post(`${BASE}/rooms`, settings ? { settings } : undefined);
  return data;
};

/** Règles et hôte d'une salle, avant de la rejoindre : { room_id, status, host_name, settings, can_join } */
export const previewRoom = async (roomId) => {
  const { data } = await api.get(`${BASE}/rooms/${encodeURIComponent(roomId)}/preview`);
  return data;
};
/**
 * Rejoint une salle existante et démarre la partie.
 * Retourne RoomStateResponse (game_state inclus).
 */
export const joinRoom = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/join`);
  return data;
};

/** Lit l'état courant (fallback polling si RTDB absent). */
export const getRoom = async (roomId) => {
  const { data } = await api.get(`${BASE}/rooms/${roomId}`);
  return data;
};

/**
 * Salle à reprendre après une actualisation : partie en cours, sinon salle
 * en attente créée par l'utilisateur. Retourne null s'il n'y a rien.
 */
export const getCurrentRoom = async () => {
  const { data } = await api.get(`${BASE}/rooms/current`);
  return data ?? null;
};

/** Annule une salle WAITING (hôte uniquement). */
export const cancelRoom = async (roomId) => {
  await api.delete(`${BASE}/rooms/${roomId}`);
};

// ── Actions de jeu ────────────────────────────────────────────────

/**
 * Joue un mot.
 * @param {string} roomId
 * @param {{ r: number, c: number, letter: string }[]} placements
 */
export const playMove = async (roomId, placements) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/move`, { placements });
  return data; // RoomStateResponse
};

/** Passe le tour. */
export const passTurn = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/pass`);
  return data;
};

/**
 * Échange des lettres.
 * @param {string} roomId
 * @param {string[]} letters
 */
export const swapTiles = async (roomId, letters) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/swap`, { letters });
  return data;
};

/** Abandonne la partie : l'adversaire gagne. */
export const resign = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/resign`);
  return data;
};

/** Réclame la victoire quand l'adversaire ne joue plus (après claim_after_s). */
export const claimWin = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/claim-win`);
  return data;
};

/** Mélange son chevalet (à tout moment ; ne consomme pas le tour). */
export const shuffleRack = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/shuffle`);
  return data;
};

/**
 * Revanche après une partie terminée.
 * Réponse : { action: 'created', room_id } (salle en attente de l'adversaire)
 *        ou { action: 'joined', room_id, game_state, … } (la partie démarre).
 */
export const rematch = async (roomId) => {
  const { data } = await api.post(`${BASE}/rooms/${roomId}/rematch`);
  return data;
};

/** Salles publiques en attente (repli quand la base temps réel est injoignable). */
export const listPublicRooms = async () => {
  const { data } = await api.get(`${BASE}/rooms/public`);
  return data;
};
