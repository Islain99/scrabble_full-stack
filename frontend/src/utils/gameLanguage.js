// src/utils/gameLanguage.js
//
// Langue de jeu d'une partie : dictionnaire, sac et valeurs des lettres
// (distincte de la langue de l'interface). Valeurs acceptées par le serveur.
// Les noms restent dans leur propre langue, comme dans un sélecteur de langue.

export const GAME_LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

/** 'en' → 'EN' ; langue absente (partie ancienne) → 'FR'. */
export const languageTag = (language) => (language || 'fr').toUpperCase();

/** 'en' → 'English' */
export const languageName = (language) =>
  GAME_LANGUAGES.find(l => l.value === (language || 'fr'))?.label ?? languageTag(language);
