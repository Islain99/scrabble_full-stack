// src/api/authService.js
import api from './axiosInstance';

// ── Auth ──────────────────────────────────────────────────────────

export const registerUser = async (displayName) => {
  const { data } = await api.post('/auth/register', { display_name: displayName });
  return data;
};

export const loginUser = async () => {
  const { data } = await api.post('/auth/login', {});
  return data;
};

export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data;
};

// ── Profil ────────────────────────────────────────────────────────

export const getProfile = async () => {
  const { data } = await api.get('/users/me');
  return data;
};

/**
 * Met à jour le profil complet du joueur.
 * Envoie uniquement les champs définis (les autres sont ignorés par le backend).
 */
export const updateProfile = async ({
  displayName,
  firstName,    // ← NOUVEAU
  lastName,     // ← NOUVEAU
  age,          // ← NOUVEAU
  country,      // ← NOUVEAU
  bio,
  avatarUrl,
}) => {
  const { data } = await api.patch('/users/me', {
    display_name: displayName,
    first_name:   firstName,   // snake_case pour le backend FastAPI
    last_name:    lastName,
    age:          age,
    country:      country,
    bio:          bio,
    avatar_url:   avatarUrl,
  });
  return data;
};

export const getPublicProfile = async (userId) => {
  const { data } = await api.get(`/users/${userId}/profile`);
  return data;
};

// ── Historique & parties ──────────────────────────────────────────

export const getHistory = async (limit = 20, offset = 0) => {
  const { data } = await api.get('/users/me/history', { params: { limit, offset } });
  return data;
};

export const saveGame = async (gameData) => {
  const { data } = await api.post('/users/me/games', gameData);
  return data;
};

// ── Classement ────────────────────────────────────────────────────

export const getLeaderboard = async ({ period = 'all', sortBy = 'best_score', limit = 50 } = {}) => {
  const { data } = await api.get('/leaderboard', { params: { period, sort_by: sortBy, limit } });
  return data;
};