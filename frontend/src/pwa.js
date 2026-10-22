// src/pwa.js
//
// Enregistrement du service worker (PWA).
// Désactivé dans l'app native Capacitor : elle embarque déjà ses fichiers,
// et un service worker dans la WebView ne ferait que gêner les mises à jour.

import { Capacitor } from '@capacitor/core';

export function registerPWA() {
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator)) return;

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        // Nouvelle version déployée : rechargement automatique (registerType: autoUpdate)
        onRegisterError(error) {
          console.warn('Service worker non enregistré :', error);
        },
      });
    })
    .catch(() => { /* plugin PWA absent (ex. tests) : on ignore */ });
}
