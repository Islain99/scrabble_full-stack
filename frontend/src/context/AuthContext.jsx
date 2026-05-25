// src/context/AuthContext.jsx
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
import { loginUser, registerUser, updateProfile as apiUpdateProfile } from '../api/authService';

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
  const [token, setToken]               = useState(null); // Firebase ID token
  const [loading, setLoading]           = useState(true); // Chargement initial
  const [error, setError]               = useState(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Récupère un token Firebase frais (auto-refresh si expiré).
   */
  const getFreshToken = useCallback(async (user = firebaseUser) => {
    if (!user) return null;
    const t = await user.getIdToken(/* forceRefresh= */ false);
    setToken(t);
    return t;
  }, [firebaseUser]);

  // ── Observateur Firebase ───────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          const t = await user.getIdToken();
          setToken(t);

          // Synchronise avec le backend (crée auto si OAuth first-time)
          const { user: profile } = await loginUser(t);
          setDbUser(profile);
        } catch (err) {
          console.error('Erreur sync backend:', err);
          // L'utilisateur est connecté Firebase mais pas encore enregistré
          // (cas normal pour email/password avant /register)
          setDbUser(null);
        }
      } else {
        setToken(null);
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

      // 3. Obtenir le token
      const t = await user.getIdToken();
      setToken(t);

      // 4. Enregistrer dans PostgreSQL
      const { user: profile } = await registerUser(t, displayName);
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
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const t = await user.getIdToken();
      setToken(t);
      const { user: profile } = await loginUser(t);
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
      const { user } = await signInWithPopup(auth, googleProvider);
      const t = await user.getIdToken();
      setToken(t);
      // loginUser crée automatiquement le profil si absent (premier login Google)
      const { user: profile, is_new_user } = await loginUser(t);
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
    setToken(null);
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
    if (!token) return;
    const updated = await apiUpdateProfile(token, { displayName, bio, avatarUrl });
    setDbUser(updated);
    return updated;
  }, [token]);

  // ── Valeur exposée ────────────────────────────────────────────

  const value = {
    // State
    firebaseUser,
    user: dbUser,          // profil PostgreSQL complet
    token,
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