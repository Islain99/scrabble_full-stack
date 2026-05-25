// src/api/axiosInstance.js
// Instance Axios centralisée avec :
//   - Injection automatique du token Firebase (refresh si expiré)
//   - Gestion globale des 401 (déconnexion automatique)

import axios from 'axios';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://scrabblefull-stack-production.up.railway.app';

// ── Instance ──────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v2`,
  timeout: 15000,
});

// ── Intercepteur REQUEST — injecte le token Firebase ──────────────

api.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      // getIdToken(false) utilise le cache Firebase si le token est encore valide,
      // et le rafraîchit automatiquement s'il a expiré (durée de vie : 1h).
      const token = await user.getIdToken(false);
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Intercepteur RESPONSE — gère les 401 globalement ─────────────

let isLoggingOut = false; // Évite les boucles de déconnexion multiples

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;

    if (status === 401 && !isLoggingOut) {
      isLoggingOut = true;

      try {
        // Tenter un refresh forcé une seule fois
        const user = auth.currentUser;
        if (user) {
          await user.getIdToken(/* forceRefresh= */ true);
          // Rejouer la requête originale avec le nouveau token
          const originalRequest = error.config;
          const newToken = await user.getIdToken(false);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          isLoggingOut = false;
          return api(originalRequest);
        }
      } catch {
        // Le refresh a échoué — déconnecter l'utilisateur
        await signOut(auth);
        // Recharger la page pour réinitialiser l'état React
        window.location.href = '/';
      } finally {
        isLoggingOut = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;