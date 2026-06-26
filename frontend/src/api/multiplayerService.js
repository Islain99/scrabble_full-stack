// src/api/multiplayerService.js
// Appels REST vers /api/v2/multiplayer/*
// Utilise axiosInstance (token Firebase injecté automatiquement).

import { api } from './axiosInstance';

const BASE = '/multiplayer';

// ── Salles ────────────────────────────────────────────────────────

/** Crée une nouvelle salle. Retourne { room_id, status, host_name } */
export const createRoom = async () => {
  const { data } = await api.post(`${BASE}/rooms`);
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