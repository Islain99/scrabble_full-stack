// src/hooks/useViewport.js
//
// Détecte si l'interface doit passer en mise en page « téléphone » :
//   - écran étroit (portrait, < 768 px de large), ou
//   - téléphone tenu à l'horizontale (hauteur < 500 px).
// Le choix portrait / paysage est ensuite fait en CSS (styles/mobile.css).

import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY =
  '(max-width: 767px), (max-height: 500px) and (orientation: landscape)';

function subscribe(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
