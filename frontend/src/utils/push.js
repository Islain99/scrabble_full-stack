// src/utils/push.js
//
// Notifications push (lot 7), par Firebase Cloud Messaging.
//
//   Navigateur (PWA) : jeton FCM lié au service worker de l'app ; les messages
//     arrivent dans public/push-sw.js, qui les affiche si l'app n'est pas au
//     premier plan. Il faut VITE_FIREBASE_VAPID_KEY (console Firebase → Cloud
//     Messaging → certificats Web Push).
//   Android / iOS (Capacitor) : plugin @capacitor/push-notifications ; le
//     système affiche la notification ; un appui ouvre la bonne page.
//
// Le choix « activé sur cet appareil » est gardé dans le navigateur
// (localStorage) ; le jeton est réinscrit à chaque connexion (il change parfois).

import { Capacitor } from '@capacitor/core';
import app from '../firebase';
import { registerPushToken, removePushToken } from '../api/accountService';

const ENABLED_KEY = 'scrabble-push-enabled';
const TOKEN_KEY   = 'scrabble-push-token';
const VAPID_KEY   = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const isNative = () => Capacitor.isNativePlatform();
const platform = () => (isNative() ? Capacitor.getPlatform() : 'web');

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* stockage indisponible : le choix n'est pas retenu */ }
}

/** 'unsupported' | 'no-config' | 'denied' | 'default' | 'granted' */
export function pushSupport() {
  if (isNative()) return 'default';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_KEY) return 'no-config';
  return Notification.permission;
}

export const pushEnabledHere = () => read(ENABLED_KEY) === '1';

// ── Navigateur ────────────────────────────────────────────────────

async function webToken() {
  const registration = await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await import('firebase/messaging');
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

async function webForget() {
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* déjà retiré */ }
}

// ── Android / iOS ─────────────────────────────────────────────────

let nativeListeners = false;

async function nativePlugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  if (!nativeListeners) {
    nativeListeners = true;
    // Appui sur une notification : la page indiquée par le serveur (ex. #/messages?c=12)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url && url.startsWith('#/')) window.location.hash = url.slice(1);
    });
  }
  return PushNotifications;
}

async function nativeToken() {
  const PushNotifications = await nativePlugin();
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') throw new Error('denied');
  return new Promise((resolve, reject) => {
    let done = false;
    PushNotifications.addListener('registration', ({ value }) => { if (!done) { done = true; resolve(value); } });
    PushNotifications.addListener('registrationError', (err) => { if (!done) { done = true; reject(err); } });
    PushNotifications.register();
  });
}

// ── API ───────────────────────────────────────────────────────────

/**
 * Active les notifications sur cet appareil (demande la permission).
 * Lève Error('denied') si le joueur refuse, Error('unsupported') sinon.
 */
export async function enablePush(locale) {
  let token;
  if (isNative()) {
    token = await nativeToken();
  } else {
    const support = pushSupport();
    if (support === 'unsupported' || support === 'no-config') throw new Error('unsupported');
    const permission = support === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('denied');
    token = await webToken();
  }
  if (!token) throw new Error('unsupported');
  await registerPushToken(token, platform(), locale);
  write(TOKEN_KEY, token);
  write(ENABLED_KEY, '1');
  return token;
}

/** Coupe les notifications sur cet appareil. */
export async function disablePush() {
  const token = read(TOKEN_KEY);
  write(ENABLED_KEY, null);
  write(TOKEN_KEY, null);
  if (token) {
    try { await removePushToken(token); } catch { /* déjà retiré, ou hors ligne */ }
  }
  if (isNative()) {
    try { (await nativePlugin()).unregister(); } catch { /* plugin absent */ }
  } else {
    await webForget();
  }
}

/** À la connexion : réinscrit le jeton si le joueur avait activé les notifications ici. */
export async function syncPush(locale) {
  if (!pushEnabledHere()) return;
  if (!isNative() && pushSupport() !== 'granted') { write(ENABLED_KEY, null); return; }
  try {
    const token = isNative() ? await nativeToken() : await webToken();
    if (!token) return;
    await registerPushToken(token, platform(), locale);
    write(TOKEN_KEY, token);
  } catch { /* au mieux : on réessaiera à la prochaine connexion */ }
}

/** À la déconnexion : cet appareil ne reçoit plus rien pour ce compte (le choix reste retenu). */
export async function detachPush({ forget = false } = {}) {
  const token = read(TOKEN_KEY);
  write(TOKEN_KEY, null);
  if (forget) write(ENABLED_KEY, null);
  if (token && !forget) {
    try { await removePushToken(token); } catch { /* hors ligne : le serveur le retirera plus tard */ }
  }
}

/** Le service worker signale un appui sur une notification : on ouvre la page. */
export function listenPushClicks() {
  if (isNative() || !('serviceWorker' in navigator)) return () => {};
  const onMessage = (event) => {
    const url = event?.data?.type === 'push-open' ? event.data.url : null;
    if (url && url.startsWith('#/')) window.location.hash = url.slice(1);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
