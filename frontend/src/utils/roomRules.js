// src/utils/roomRules.js
//
// Règles d'une salle multijoueur : valeurs proposées (celles acceptées par
// le serveur, RoomSettings) et mise en forme.

export const TURN_CHOICES   = [0, 30, 60, 120, 180, 300];
export const PASS_CHOICES   = [6, 4];
export const TARGET_CHOICES = [null, 150, 250, 400];
export const DEFAULT_SETTINGS = {
  name: '', visibility: 'private', turn_seconds: 0, allow_swap: true, show_preview: true, max_passes: 6, target_score: null,
};
export const NAME_MAX = 40;

/** 30 → « 30 s », 120 → « 2 min », 0 → « Aucun » */
export function formatTurn(seconds, t) {
  if (!seconds) return t('rr_none');
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}

/** Nom affiché : celui choisi par l'hôte, sinon « Partie de {hôte} ». */
export function roomDisplayName(settings, hostName, t) {
  return settings?.name || t('rr_default_name', { name: hostName ?? '' });
}
