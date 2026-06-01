// src/api/authService.js
// Toutes les requêtes authentifiées passent par axiosInstance
// qui injecte le token Firebase automatiquement.
import { api } from './axiosInstance';

// ── Auth ──────────────────────────────────────────────────────────

/**
 * loginUser() est appelé après une connexion Firebase réussie pour synchroniser l'état avec le backend.
 * Il crée un compte sur le backend si c'est la première connexion de l'utilisateur.
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 */
export const loginUser = async () => {
  const { data } = await api.post('/auth/login', {});
  return data;
};

/**
 *L'inscription est gérée côté Firebase (email/password ou Google), puis loginUser() synchronise avec le backend.
  * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
  * Note : le backend ne gère pas la création de compte, il se contente de créer un profil lié à l'UID Firebase lors du premier login.
 */
export const registerUser = async (displayName) => {
  // Le token Firebase est récupéré dans axiosInstance via auth.currentUser
  const { data } = await api.post('/auth/register', {
    display_name: displayName,
  });
  return data;
};

/**
 * Utilisateur Courant
 */
export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data;
};

// ── Profil ────────────────────────────────────────────────────────

/**
 * Récupère le profil complet de l'utilisateur connecté.
 * Retourne : { id, displayName, bio, avatarUrl, ... }
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 */
export const getProfile = async () => {
  const { data } = await api.get('/users/me');
  return data;
};

/**
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 * Met à jour le profil de l'utilisateur connecté.
 * Accepte : displayName, bio, avatarUrl (tous optionnels)
 * Retourne le profil mis à jour.
 */
export const updateProfile = async ({ displayName, bio, avatarUrl }) => {
  const { data } = await api.patch('/users/me', {
    display_name: displayName,
    bio,
    avatar_url: avatarUrl,
  });
  return data;
};

/**
 * Récupère le profil public d'un utilisateur par son ID.
 * Retourne : { id, displayName, bio, avatarUrl, ... }
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 */
export const getPublicProfile = async (userId) => {
  const { data } = await api.get(`/users/${userId}/profile`);
  return data;
};

// ── Historique & parties ─────────────────────────────────────────

/* Récupère l'historique de parties de l'utilisateur connecté.
 * Retourne une liste de parties avec : { gameId, opponentName, score, date, ... }
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 * Supporte la pagination avec limit et offset.
 */
export const getHistory = async (limit = 20, offset = 0) => {
  const { data } = await api.get('/users/me/history', {
    params: { limit, offset },
  });
  return data;
};

/* Sauvegarde une partie terminée dans l'historique de l'utilisateur connecté.
 * Accepte : { opponentName, score, opponentScore, result, date, ... }
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 * Retourne la partie sauvegardée avec son ID.
 */
export const saveGame = async (gameData) => {
  const { data } = await api.post('/users/me/games', gameData);
  return data;
};

// ── Classement ────────────────────────────────────────────────────

/* Récupère le classement global ou périodique.
 * Accepte : period ('all', 'month', 'week'), sortBy ('best_score', 'total_score', 'games_played'), limit (nombre de résultats)
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 * Retourne une liste d'utilisateurs avec : { userId, displayName, bestScore, totalScore, gamesPlayed, ... }
 */
export const getLeaderboard = async ({ period = 'all', sortBy = 'best_score', limit = 50 } = {}) => {
  const { data } = await api.get('/leaderboard', {
    params: { period, sort_by: sortBy, limit },
  });
  return data;
};

// ── Préférences de jeu ────────────────────────────────────────────

/**
 *  Récupère les préférences de jeu de l'utilisateur connecté.
 *  Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 *  Retourne un objet de préférences, par exemple : { difficulty: 'medium', turnDuration: 60, theme: 'dark', ... }
 *  Ces préférences sont utilisées pour personnaliser l'expérience de jeu (ex: difficulté de l'IA, durée des tours, thème visuel).
 */
export const getPreferences = async () => {
  const { data } = await api.get('/users/me/preferences');
  return data;
};

/**
 * Met à jour les préférences de jeu de l'utilisateur connecté.
 * Accepte un objet de préférences partielles, par exemple : { difficulty: 'hard' } ou { turnDuration: 90 }
 * Le token Firebase est automatiquement inclus dans les requêtes grâce à l'intercepteur d'axiosInstance.
 * Retourne les préférences mises à jour.
 */
export const savePreferences = async (patch) => {
  const { data } = await api.put('/users/me/preferences', patch);
  return data;
};