// src/context/AuthContext.jsx — updateUserProfile enrichi avec les nouveaux champs profil

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
  const [error, setError]               = useState(null);

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
      const msg = firebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
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

  /**
   * Met à jour le profil complet du joueur.
   * Accepte : displayName, firstName, lastName, age, country, bio, avatarUrl.
   */
  const updateUserProfile = useCallback(async ({
    displayName, firstName, lastName, age, country, bio, avatarUrl,
  }) => {
    const updated = await apiUpdateProfile({
      displayName, firstName, lastName, age, country, bio, avatarUrl,
    });
    setDbUser(updated);
    return updated;
  }, []);

  const value = {
    firebaseUser,
    user: dbUser,
    loading,
    error,
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