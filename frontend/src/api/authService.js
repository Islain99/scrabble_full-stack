// src/api/authService.js
// Appels vers les nouvelles routes /api/v2 du backend FastAPI.
// Firebase Auth (signIn/signUp/signOut) est géré dans AuthContext.
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  || 'https://scrabblefull-stack-production.up.railway.app';

const API = `${BASE_URL}/api/v2`;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Crée un header Authorization Bearer à partir du token Firebase.
 * Le token est rafraîchi automatiquement par Firebase si expiré.
 */
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });


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

export const getHistory = async (firebaseToken, limit = 20, offset = 0) => {
  const { data } = await axios.get(
    `${API}/users/me/history`,
    { headers: authHeader(firebaseToken), params: { limit, offset } }
  );
  return data; // GameHistoryOut[]
};

/**
 * Sauvegarde une partie terminée.
 * Appelé automatiquement par App.jsx quand status === 'FINISHED'.
 */
export const saveGame = async (firebaseToken, gameData) => {
  const { data } = await axios.post(
    `${API}/users/me/games`,
    gameData,
    { headers: authHeader(firebaseToken) }
  );
  return data;
};


// ── Classement ────────────────────────────────────────────────────

export const getLeaderboard = async (firebaseToken = null, {
  period = 'all',
  sortBy = 'best_score',
  limit = 50,
} = {}) => {
  const headers = firebaseToken ? authHeader(firebaseToken) : {};
  const { data } = await axios.get(`${API}/leaderboard`, {
    headers,
    params: { period, sort_by: sortBy, limit },
  });
  return data; // LeaderboardResponse
};