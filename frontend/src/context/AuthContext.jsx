// src/context/AuthContext.jsx
//
// ⚡ Changements vs version précédente :
//   - Les fonctions ne passent plus `token` manuellement aux services :
//     l'intercepteur Axios (axiosInstance.js) le fait automatiquement.
//   - `updateUserProfile` appelle `updateProfile()` sans token.
//   - `getFreshToken` conservé pour les cas où le token brut est nécessaire
//     (ex: upload vers Firebase Storage).

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import {
  loginUser,
  registerUser,
  updateProfile as apiUpdateProfile,
} from '../api/authService';

// ── Context ───────────────────────────────────────────────────────

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
};

// ── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null); // User Firebase brut
  const [dbUser, setDbUser]             = useState(null); // UserOut PostgreSQL
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Retourne le token Firebase courant (avec refresh automatique si expiré).
   * Utile pour les appels directs à Firebase (ex: Storage).
   * Pour les appels API backend, l'intercepteur Axios le gère automatiquement.
   */
  const getFreshToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(false);
  }, []);

  // ── Observateur Firebase ───────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          // loginUser utilise l'intercepteur Axios — pas besoin de passer le token
          const { user: profile } = await loginUser();
          setDbUser(profile);
        } catch (err) {
          console.error('Erreur sync backend:', err);
          // Cas normal pour email/password avant /register
          setDbUser(null);
        }
      } else {
        setDbUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── Actions auth ──────────────────────────────────────────────

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    setError(null);
    try {
      // 1. Créer le compte Firebase
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Mettre à jour le displayName dans Firebase
      await firebaseUpdateProfile(user, { displayName });

      // 3. Enregistrer dans PostgreSQL
      // L'intercepteur Axios récupère le token de auth.currentUser automatiquement
      const { user: profile } = await registerUser(displayName);
      setDbUser(profile);

      return profile;
    } catch (err) {
      const msg = firebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged appellera loginUser automatiquement
      // On peut aussi appeler loginUser() directement ici pour retourner le profil
      const { user: profile } = await loginUser();
      setDbUser(profile);
      return profile;
    } catch (err) {
      const msg = firebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // loginUser crée automatiquement le profil si absent (premier login Google)
      const { user: profile, is_new_user } = await loginUser();
      setDbUser(profile);
      return { profile, isNew: is_new_user };
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return null;
      const msg = firebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setDbUser(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const msg = firebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const updateUserProfile = useCallback(async ({ displayName, bio, avatarUrl }) => {
    // Plus besoin de vérifier/passer le token — l'intercepteur s'en charge
    const updated = await apiUpdateProfile({ displayName, bio, avatarUrl });
    setDbUser(updated);
    return updated;
  }, []);

  // ── Valeur exposée ────────────────────────────────────────────

  const value = {
    // State
    firebaseUser,
    user: dbUser,
    loading,
    error,
    isAuthenticated: !!dbUser,

    // Actions
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    logout,
    resetPassword,
    updateUserProfile,
    getFreshToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Messages d'erreur Firebase lisibles ──────────────────────────

function firebaseErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use':    'Cette adresse email est déjà utilisée.',
    'auth/invalid-email':           'Adresse email invalide.',
    'auth/weak-password':           'Mot de passe trop faible (6 caractères minimum).',
    'auth/user-not-found':          'Aucun compte avec cet email.',
    'auth/wrong-password':          'Mot de passe incorrect.',
    'auth/invalid-credential':      'Email ou mot de passe incorrect.',
    'auth/too-many-requests':       'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed':  'Erreur réseau. Vérifiez votre connexion.',
    'auth/popup-blocked':           'Popup bloquée. Autorisez les popups pour Google.',
    'auth/account-exists-with-different-credential':
                                    'Un compte existe déjà avec cet email (autre méthode).',
  };
  return messages[code] || `Erreur d'authentification (${code}).`;
}