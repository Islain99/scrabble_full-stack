// src/i18n/translations.js
// Toutes les chaînes UI — ajouter une langue = ajouter une entrée ici.
// Conventions de nommage :
//   nav_*       → Navbar
//   theme_*     → libellés thème (partagés Navbar + SettingsPage)
//   section_*   → titres de section dans SettingsPage
//   row_*       → lignes de paramètres (label + desc)
//   diff_*      → niveaux de difficulté IA
//   sync_*      → badge de synchronisation
//   btn_*       → boutons génériques
//   turn_*      → options de durée de tour
//   start_*     → écran de démarrage (web + mobile)
//   game_*      → GamePage / GameScreen
//   legend_*    → légende du plateau
//   profile_*   → ProfilePage

export const translations = {

  // ══════════════════════════════════════════════════════════════
  fr: {

    // ── Navbar ────────────────────────────────────────────────
    nav_play:        'Jouer',
    nav_leaderboard: 'Classement',
    nav_profile:     'Profil',
    nav_settings:    'Paramètres',
    nav_login:       'Connexion',
    nav_register:    'Inscription',
    nav_logout:      'Déconnexion',
    nav_appearance:  'Apparence',
    nav_currently:   'Actuellement',

    // ── Thème (Navbar + SettingsPage) ─────────────────────────
    theme_light:  'Clair',
    theme_dark:   'Sombre',
    theme_system: 'Système',

    // ── SettingsPage — titre ──────────────────────────────────
    settings_title:    'Paramètres',
    settings_subtitle: 'Les préférences sont sauvegardées automatiquement',

    // ── SettingsPage — sections ───────────────────────────────
    section_appearance: 'Apparence',
    section_game:       'Partie',
    section_display:    'Affichage',
    section_behavior:   'Comportement',

    // ── SettingsPage — lignes ─────────────────────────────────
    row_theme:                   'Thème',
    row_theme_desc:              'Choisissez entre clair, sombre, ou la préférence de votre système.',
    row_language:                "Langue de l'interface",
    row_language_desc:           'Français ou anglais.',
    row_difficulty:              "Difficulté de l'IA",
    row_difficulty_desc:         "Niveau de l'adversaire IA.",
    row_turn_duration:           'Durée du tour',
    row_turn_duration_desc:      'Temps imparti par tour. Quand le temps expire, le tour est passé automatiquement.',
    row_score_preview:           'Aperçu du score',
    row_score_preview_desc:      'Afficher le score estimé pendant le placement des tuiles.',
    row_remaining_tiles:         'Tuiles restantes',
    row_remaining_tiles_desc:    'Afficher le nombre de tuiles restantes dans le sac.',
    row_bonus_labels:            'Labels des cases bonus',
    row_bonus_labels_desc:       'Afficher 2M, 3L, etc. sur les cases spéciales du plateau.',
    row_animations:              'Animations',
    row_animations_desc:         'Transitions et effets visuels.',
    row_auto_sort:               'Tri automatique du rack',
    row_auto_sort_desc:          'Trier les lettres du rack par ordre alphabétique.',
    row_confirm_validation:      'Confirmer avant valider',
    row_confirm_validation_desc: 'Demander une confirmation avant de valider un mot.',

    // ── Boutons génériques ────────────────────────────────────
    btn_reset:         'Réinitialiser tous les paramètres',
    btn_cancel:        'Annuler',
    btn_confirm_reset: 'Réinitialiser',
    btn_validate:      'Valider',
    btn_pass:          'Passer',
    btn_exchange:      'Échanger',
    btn_resign:        'Abandonner',
    confirm_reset:     'Confirmer la réinitialisation ?',

    // ── Sync badge ────────────────────────────────────────────
    sync_syncing:    '⟳ Synchronisation…',
    sync_saved:      '✓ Sauvegardé',
    sync_not_synced: 'Non synchronisé',
    sync_guest:      'Mode invité — connectez-vous pour synchroniser',

    // ── Difficultés ───────────────────────────────────────────
    diff_beginner_label:   'Débutant',
    diff_beginner_desc:    "Mots très courts, beaucoup d'erreurs",
    diff_easy_label:       'Facile',
    diff_easy_desc:        'Mots courts, ignore les cases bonus',
    diff_medium_label:     'Moyen',
    diff_medium_desc:      'Équilibré, utilise quelques bonus',
    diff_hard_minus_label: 'Difficile',
    diff_hard_minus_desc:  "Mots longs, tous les bonus, peu d'erreurs",
    diff_hard_label:       'Expert',
    diff_hard_desc:        'Maximise chaque score, tous les bonus',

    // ── Durées de tour ────────────────────────────────────────
    turn_unlimited: 'Illimité',
    turn_1min:      '1 minute',
    turn_2min:      '2 minutes',
    turn_3min:      '3 minutes',
    turn_5min:      '5 minutes',

    // ── Légende plateau ───────────────────────────────────────
    legend_tw: 'Triple mot',
    legend_dw: 'Double mot',
    legend_tl: 'Triple lettre',
    legend_dl: 'Double lettre',

    // ── Écran de démarrage (web + mobile) ─────────────────────
    start_edition:            'Édition de Luxe — 1972',
    start_subtitle:           'Le jeu classique des mots croisés',
    start_btn:                'Démarrer la partie',
    start_loading:            'Démarrage…',
    start_change_in:          'Modifiable dans',
    start_your_name:          'Votre nom',
    start_player_placeholder: 'Joueur 1',
    start_difficulty:         "Difficulté de l'IA",

    // ── GamePage ──────────────────────────────────────────────
    game_score_preview:   'Aperçu du score',
    game_tiles_singular:  'tuile',
    game_tiles_plural:    'tuiles',
    game_placed_singular: 'posée',
    game_placed_plural:   'posées',
    game_swap_selected:   'sélectionnée(s) pour l'échange',
    game_drag_hint:       'Glissez vos lettres sur le plateau',
    game_swap_hint:       'Sélectionnez les lettres à échanger dans le rack',
    game_swap_cancel:     "Annuler l'échange",
    game_swap_mode:       'Mode échange',
    game_shuffle:         'Mélanger le rack',
    game_abandon:         'Abandonner la partie',
    game_abandon_title:   'Abandonner ?',
    game_abandon_desc:    'La partie sera comptée comme une défaite.',
    game_abandon_confirm: 'Confirmer',
    game_confirm_play:    'Valider ce mot',
    game_win_title:       'Victoire !',
    game_lose_title:      'Défaite',
    game_wins_sentence:   'remporte la partie',
    game_replay:          'Rejouer',
    game_my_profile:      'Mon profil',
    ai_thinking:          "L'IA réfléchit…",

    // ── ProfilePage ───────────────────────────────────────────
    profile_title:   'Profil',
    profile_victory: '✓ Victoire',
    profile_defeat:  '✗ Défaite',
  },

  // ══════════════════════════════════════════════════════════════
  en: {

    // ── Navbar ────────────────────────────────────────────────
    nav_play:        'Play',
    nav_leaderboard: 'Leaderboard',
    nav_profile:     'Profile',
    nav_settings:    'Settings',
    nav_login:       'Log in',
    nav_register:    'Sign up',
    nav_logout:      'Log out',
    nav_appearance:  'Appearance',
    nav_currently:   'Currently',

    // ── Theme ─────────────────────────────────────────────────
    theme_light:  'Light',
    theme_dark:   'Dark',
    theme_system: 'System',

    // ── SettingsPage — title ──────────────────────────────────
    settings_title:    'Settings',
    settings_subtitle: 'Preferences are saved automatically',

    // ── SettingsPage — sections ───────────────────────────────
    section_appearance: 'Appearance',
    section_game:       'Game',
    section_display:    'Display',
    section_behavior:   'Behaviour',

    // ── SettingsPage — rows ───────────────────────────────────
    row_theme:                   'Theme',
    row_theme_desc:              'Choose between light, dark, or your system preference.',
    row_language:                'Interface Language',
    row_language_desc:           'French or English.',
    row_difficulty:              'AI Difficulty',
    row_difficulty_desc:         'Opponent AI level.',
    row_turn_duration:           'Turn Duration',
    row_turn_duration_desc:      'Time allowed per turn. When time runs out, the turn is passed automatically.',
    row_score_preview:           'Score Preview',
    row_score_preview_desc:      'Show the estimated score while placing tiles.',
    row_remaining_tiles:         'Remaining Tiles',
    row_remaining_tiles_desc:    'Show the number of tiles remaining in the bag.',
    row_bonus_labels:            'Bonus Square Labels',
    row_bonus_labels_desc:       'Show DL, TL, DW, TW on special squares.',
    row_animations:              'Animations',
    row_animations_desc:         'Transitions and visual effects.',
    row_auto_sort:               'Auto-sort Rack',
    row_auto_sort_desc:          'Sort rack letters alphabetically.',
    row_confirm_validation:      'Confirm Before Submit',
    row_confirm_validation_desc: 'Ask for confirmation before submitting a word.',

    // ── Generic buttons ───────────────────────────────────────
    btn_reset:         'Reset all settings',
    btn_cancel:        'Cancel',
    btn_confirm_reset: 'Reset',
    btn_validate:      'Submit',
    btn_pass:          'Pass',
    btn_exchange:      'Exchange',
    btn_resign:        'Resign',
    confirm_reset:     'Confirm reset?',

    // ── Sync badge ────────────────────────────────────────────
    sync_syncing:    '⟳ Syncing…',
    sync_saved:      '✓ Saved',
    sync_not_synced: 'Not synced',
    sync_guest:      'Guest mode — log in to sync',

    // ── Difficulties ──────────────────────────────────────────
    diff_beginner_label:   'Beginner',
    diff_beginner_desc:    'Very short words, many mistakes',
    diff_easy_label:       'Easy',
    diff_easy_desc:        'Short words, ignores bonus squares',
    diff_medium_label:     'Medium',
    diff_medium_desc:      'Balanced, uses some bonuses',
    diff_hard_minus_label: 'Hard',
    diff_hard_minus_desc:  'Long words, all bonuses, few mistakes',
    diff_hard_label:       'Expert',
    diff_hard_desc:        'Maximises every score, all bonuses',

    // ── Turn options ──────────────────────────────────────────
    turn_unlimited: 'Unlimited',
    turn_1min:      '1 minute',
    turn_2min:      '2 minutes',
    turn_3min:      '3 minutes',
    turn_5min:      '5 minutes',

    // ── Board legend ──────────────────────────────────────────
    legend_tw: 'Triple Word',
    legend_dw: 'Double Word',
    legend_tl: 'Triple Letter',
    legend_dl: 'Double Letter',

    // ── Start screen (web + mobile) ───────────────────────────
    start_edition:            'Luxury Edition — 1972',
    start_subtitle:           'The classic crossword board game',
    start_btn:                'Start Game',
    start_loading:            'Starting…',
    start_change_in:          'Change in',
    start_your_name:          'Your name',
    start_player_placeholder: 'Player 1',
    start_difficulty:         'AI Difficulty',

    // ── GamePage ──────────────────────────────────────────────
    game_score_preview:   'Score Preview',
    game_tiles_singular:  'tile',
    game_tiles_plural:    'tiles',
    game_placed_singular: 'placed',
    game_placed_plural:   'placed',
    game_swap_selected:   'selected for exchange',
    game_drag_hint:       'Drag your letters onto the board',
    game_swap_hint:       'Select the letters to exchange from your rack',
    game_swap_cancel:     'Cancel exchange',
    game_swap_mode:       'Exchange mode',
    game_shuffle:         'Shuffle rack',
    game_abandon:         'Resign',
    game_abandon_title:   'Resign?',
    game_abandon_desc:    'This game will be counted as a loss.',
    game_abandon_confirm: 'Confirm',
    game_confirm_play:    'Submit this word',
    game_win_title:       'Victory!',
    game_lose_title:      'Defeat',
    game_wins_sentence:   'wins the game',
    game_replay:          'Play again',
    game_my_profile:      'My profile',
    ai_thinking:          'AI is thinking…',

    // ── ProfilePage ───────────────────────────────────────────
    profile_title:   'Profile',
    profile_victory: '✓ Win',
    profile_defeat:  '✗ Loss',
  },
};

export const LANGUAGES = [
  { value: 'fr', label: 'Français', emoji: '🇫🇷' },
  { value: 'en', label: 'English',  emoji: '🇬🇧' },
];