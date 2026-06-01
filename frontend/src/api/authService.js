// src/api/authService.js
// Appels vers les nouvelles routes /api/v2 du backend FastAPI.
// Firebase Auth (signIn/signUp/signOut) est géré dans AuthContext.
import axios from 'axios';
import { auth } from '../firebase';

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  || 'https://scrabblefull-stack-production.up.railway.app';

const API = `${BASE_URL}/api/v2`;

// ── Helpers ───────────────────────────────────────────────────────

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Récupère un token Firebase frais depuis l'utilisateur courant.
 * Utilisé pour les appels qui ne passent pas par axiosInstance.
 */
const getFreshToken = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté');
  return user.getIdToken(false);
};


// ── Auth ──────────────────────────────────────────────────────────

/**
 * Enregistre un nouvel utilisateur dans PostgreSQL après Firebase signup.
 * Appelé une seule fois après createUserWithEmailAndPassword.
 */
export const registerUser = async (firebaseToken, displayName) => {
  const { data } = await axios.post(`${API}/auth/register`, {
    firebase_token: firebaseToken,
    display_name: displayName,
  });
  return data; // { user: UserOut, is_new_user: bool }
};

/**
 * Login : enregistre la session dans PostgreSQL et retourne le profil.
 * Appelé après signInWithEmailAndPassword ou signInWithPopup.
 */
export const loginUser = async (firebaseToken) => {
  const { data } = await axios.post(
    `${API}/auth/login`,
    {},
    { headers: authHeader(firebaseToken) }
  );
  return data; // { user: UserOut, is_new_user: bool }
};

/**
 * Retourne le profil rapide de l'utilisateur connecté.
 */
export const getMe = async (firebaseToken) => {
  const { data } = await axios.get(
    `${API}/auth/me`,
    { headers: authHeader(firebaseToken) }
  );
  return data; // UserOut
};


// ── Profil ────────────────────────────────────────────────────────

export const getProfile = async (firebaseToken) => {
  const { data } = await axios.get(
    `${API}/users/me`,
    { headers: authHeader(firebaseToken) }
  );
  return data;
};

export const updateProfile = async (firebaseToken, { displayName, bio, avatarUrl }) => {
  const { data } = await axios.patch(
    `${API}/users/me`,
    { display_name: displayName, bio, avatar_url: avatarUrl },
    { headers: authHeader(firebaseToken) }
  );
  return data;
};

export const getPublicProfile = async (userId) => {
  const { data } = await axios.get(`${API}/users/${userId}/profile`);
  return data;
};


// ── Historique & parties ─────────────────────────────────────────

export const getHistory = async (limit = 20, offset = 0) => {
  const token = await getFreshToken();
  const { data } = await axios.get(
    `${API}/users/me/history`,
    { headers: authHeader(token), params: { limit, offset } }
  );
  return data;
};

/**
 * Sauvegarde une partie terminée.
 * Appelé automatiquement par App.jsx quand status === 'FINISHED'.
 */
export const saveGame = async (gameData) => {
  const token = await getFreshToken();
  const { data } = await axios.post(
    `${API}/users/me/games`,
    gameData,
    { headers: authHeader(token) }
  );
  return data;
};


// ── Classement ────────────────────────────────────────────────────

export const getLeaderboard = async ({
  period = 'all',
  sortBy = 'best_score',
  limit = 50,
} = {}) => {
  let headers = {};
  try {
    const token = await getFreshToken();
    headers = authHeader(token);
  } catch {
    // Non connecté — le classement est public
  }
  const { data } = await axios.get(`${API}/leaderboard`, {
    headers,
    params: { period, sort_by: sortBy, limit },
  });
  return data; // LeaderboardResponse
};


// ── Préférences de jeu ────────────────────────────────────────────

/**
 * Récupère les préférences de jeu depuis le serveur.
 * Utilise le token Firebase courant directement.
 */
export const getPreferences = async () => {
  const token = await getFreshToken();
  const { data } = await axios.get(
    `${API}/users/me/preferences`,
    { headers: authHeader(token) }
  );
  return data;
};

/**
 * Sauvegarde les préférences de jeu sur le serveur (PUT partiel).
 * patch = { difficulty, turnDuration, showScorePreview, ... }
 */
export const savePreferences = async (patch) => {
  const token = await getFreshToken();
  const { data } = await axios.put(
    `${API}/users/me/preferences`,
    patch,
    { headers: authHeader(token) }
  );
  return data;
};