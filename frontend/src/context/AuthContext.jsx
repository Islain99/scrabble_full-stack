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
import { useLanguage } from './LanguageContext';
import {
  loginUser,
  registerUser,
  updateProfile as apiUpdateProfile,
} from '../api/authService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
};

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [dbUser, setDbUser]             = useState(null);
  const [loading, setLoading]           = useState(true);
  // Code d'erreur Firebase ; le message est traduit à l'affichage (voir `error` plus bas)
  const [error, setError]               = useState(null);
  const { t } = useLanguage();

  const clearError = useCallback(() => setError(null), []);

  const getFreshToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const { user: profile } = await loginUser();
          setDbUser(profile);
        } catch (err) {
          console.error('Erreur sync backend:', err);
          setDbUser(null);
        }
      } else {
        setDbUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    setError(null);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await firebaseUpdateProfile(user, { displayName });
      const { user: profile } = await registerUser(displayName);
      setDbUser(profile);
      return profile;
    } catch (err) {
      setError(err.code ?? 'unknown');
      throw new Error(firebaseErrorMessage(err.code, t));
    }
  }, [t]);

  const signInWithEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const { user: profile } = await loginUser();
      setDbUser(profile);
      return profile;
    } catch (err) {
      setError(err.code ?? 'unknown');
      throw new Error(firebaseErrorMessage(err.code, t));
    }
  }, [t]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      const { user: profile, is_new_user } = await loginUser();
      setDbUser(profile);
      return { profile, isNew: is_new_user };
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return null;
      setError(err.code ?? 'unknown');
      throw new Error(firebaseErrorMessage(err.code, t));
    }
  }, [t]);

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
      setError(err.code ?? 'unknown');
      throw new Error(firebaseErrorMessage(err.code, t));
    }
  }, [t]);

  /**
   * Met à jour le profil complet.
   * Accepte : displayName, firstName, lastName, age, country, bio, avatarUrl
   */
  const updateUserProfile = useCallback(async ({
    displayName,
    firstName,   // ← NOUVEAU
    lastName,    // ← NOUVEAU
    age,         // ← NOUVEAU
    country,     // ← NOUVEAU
    bio,
    avatarUrl,
  }) => {
    const updated = await apiUpdateProfile({
      displayName,
      firstName,
      lastName,
      age,
      country,
      bio,
      avatarUrl,
    });
    setDbUser(updated);
    return updated;
  }, []);

  const value = {
    firebaseUser,
    user: dbUser,
    loading,
    error: error ? firebaseErrorMessage(error, t) : null,
    isAuthenticated: !!dbUser,
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

// Code d'erreur Firebase → clé de traduction
const FIREBASE_ERROR_KEYS = {
  'auth/email-already-in-use':   'auth_err_email_in_use',
  'auth/invalid-email':          'auth_err_invalid_email',
  'auth/weak-password':          'auth_err_weak_password',
  'auth/user-not-found':         'auth_err_user_not_found',
  'auth/wrong-password':         'auth_err_wrong_password',
  'auth/invalid-credential':     'auth_err_invalid_credential',
  'auth/too-many-requests':      'auth_err_too_many',
  'auth/network-request-failed': 'auth_err_network',
  'auth/popup-blocked':          'auth_err_popup_blocked',
  'auth/account-exists-with-different-credential': 'auth_err_exists_other',
};

function firebaseErrorMessage(code, t) {
  const key = FIREBASE_ERROR_KEYS[code];
  return key ? t(key) : t('auth_err_generic', { code: code ?? 'unknown' });
}
