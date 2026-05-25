// src/api/authService.js
// Appels vers les routes /api/v2 du backend FastAPI.
// Firebase Auth (signIn/signUp/signOut) est géré dans AuthContext.
//
// ⚡ Changements vs version précédente :
//   - Utilise l'instance `api` (axiosInstance.js) — plus besoin de passer
//     le token manuellement, l'intercepteur REQUEST s'en charge.
//   - /register envoie le token en header Bearer (au lieu du body JSON).
//   - Plus de paramètre `firebaseToken` dans les fonctions.

import api from './axiosInstance';


// ── Auth ──────────────────────────────────────────────────────────

/**
 * Enregistre un nouvel utilisateur dans PostgreSQL après Firebase signup.
 * Appelé une seule fois après createUserWithEmailAndPassword.
 * Le token Firebase est injecté automatiquement par l'intercepteur Axios.
 */
export const registerUser = async (displayName) => {
  const { data } = await api.post('/auth/register', {
    display_name: displayName,
  });
  return data; // { user: UserOut, is_new_user: bool }
};

/**
 * Login : synchronise la session dans PostgreSQL et retourne le profil.
 * Appelé après signInWithEmailAndPassword ou signInWithPopup.
 */
export const loginUser = async () => {
  const { data } = await api.post('/auth/login', {});
  return data; // { user: UserOut, is_new_user: bool }
};

/**
 * Retourne le profil rapide de l'utilisateur connecté.
 */
export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data; // UserOut
};


// ── Profil ────────────────────────────────────────────────────────

export const getProfile = async () => {
  const { data } = await api.get('/users/me');
  return data;
};

export const updateProfile = async ({ displayName, bio, avatarUrl }) => {
  const { data } = await api.patch('/users/me', {
    display_name: displayName,
    bio,
    avatar_url: avatarUrl,
  });
  return data;
};

export const getPublicProfile = async (userId) => {
  // Route publique — pas besoin de token, mais l'intercepteur l'ajoutera si connecté
  const { data } = await api.get(`/users/${userId}/profile`);
  return data;
};


// ── Historique & parties ──────────────────────────────────────────

export const getHistory = async (limit = 20, offset = 0) => {
  const { data } = await api.get('/users/me/history', {
    params: { limit, offset },
  });
  return data; // GameHistoryOut[]
};

/**
 * Sauvegarde une partie terminée.
 * Appelé automatiquement par App.jsx quand status === 'FINISHED'.
 */
export const saveGame = async (gameData) => {
  const { data } = await api.post('/users/me/games', gameData);
  return data;
};


// ── Classement ────────────────────────────────────────────────────

export const getLeaderboard = async ({
  period = 'all',
  sortBy = 'best_score',
  limit = 50,
} = {}) => {
  const { data } = await api.get('/leaderboard', {
    params: { period, sort_by: sortBy, limit },
  });
  return data; // LeaderboardResponse
};