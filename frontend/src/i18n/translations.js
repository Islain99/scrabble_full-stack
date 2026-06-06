// src/i18n/translations.js
// Toutes les chaînes UI. Ajouter une langue = ajouter une entrée ici.

export const translations = {
  fr: {
    // Navbar
    nav_play:          'Jouer',
    nav_leaderboard:   'Classement',
    nav_profile:       'Profil',
    nav_settings:      'Paramètres',
    nav_login:         'Connexion',
    nav_register:      'Inscription',
    nav_logout:        'Déconnexion',

    // Thème
    theme_light:       'Clair',
    theme_dark:        'Sombre',
    theme_system:      'Système',

    // SettingsPage — sections
    settings_title:       'Paramètres',
    settings_subtitle:    'Les préférences sont sauvegardées automatiquement',
    section_appearance:   'Apparence',
    section_game:         'Partie',
    section_display:      'Affichage',
    section_behavior:     'Comportement',
    section_language:     'Langue',

    // SettingsPage — lignes
    row_theme:            'Thème',
    row_theme_desc:       'Choisissez entre clair, sombre, ou la préférence de votre système.',
    row_difficulty:       "Difficulté de l'IA",
    row_difficulty_desc:  "Niveau de l'adversaire IA.",
    row_turn_duration:    'Durée du tour',
    row_turn_duration_desc: 'Temps imparti par tour. 0 = illimité.',
    row_score_preview:    'Aperçu du score',
    row_score_preview_desc: 'Afficher le score potentiel avant de valider.',
    row_remaining_tiles:  'Tuiles restantes',
    row_remaining_tiles_desc: 'Afficher le nombre de tuiles restantes dans le sac.',
    row_bonus_labels:     'Labels des cases bonus',
    row_bonus_labels_desc: 'Afficher 2M, 3L, etc. sur les cases spéciales du plateau.',
    row_animations:       'Animations',
    row_animations_desc:  'Transitions et effets visuels.',
    row_auto_sort:        'Tri automatique du rack',
    row_auto_sort_desc:   'Trier les lettres du rack par ordre alphabétique.',
    row_confirm_validation: 'Confirmer avant valider',
    row_confirm_validation_desc: 'Demander une confirmation avant de valider un mot.',
    row_language:         'Langue de l\'interface',
    row_language_desc:    'Français ou anglais.',

    // Reset
    btn_reset:            'Réinitialiser tous les paramètres',
    confirm_reset:        'Confirmer la réinitialisation ?',
    btn_cancel:           'Annuler',
    btn_confirm_reset:    'Réinitialiser',

    // Sync badge
    sync_syncing:         '⟳ Synchronisation…',
    sync_saved:           '✓ Sauvegardé',
    sync_not_synced:      'Non synchronisé',
    sync_guest:           'Mode invité — connectez-vous pour synchroniser',

    // Difficulté
    diff_beginner_label:  'Débutant',
    diff_beginner_desc:   "Mots très courts, beaucoup d'erreurs",
    diff_easy_label:      'Facile',
    diff_easy_desc:       'Mots courts, ignore les cases bonus',
    diff_medium_label:    'Moyen',
    diff_medium_desc:     'Équilibré, utilise quelques bonus',
    diff_hard_minus_label:'Difficile',
    diff_hard_minus_desc: "Mots longs, tous les bonus, peu d'erreurs",
    diff_hard_label:      'Expert',
    diff_hard_desc:       'Maximise chaque score, tous les bonus',

    // GamePage
    score_preview_label:  'Aperçu du score',
    tiles_label:          'tuile',
    tiles_label_plural:   'tuiles',
    placed_label:         'posée',
    placed_label_plural:  'posées',
    btn_validate:         'Valider',
    btn_pass:             'Passer',
    btn_exchange:         'Échanger',
    btn_resign:           'Abandonner',
    ai_thinking:          "L'IA réfléchit…",

    // Turn options
    turn_unlimited:       'Illimité',
    turn_1min:            '1 minute',
    turn_2min:            '2 minutes',
    turn_3min:            '3 minutes',
    turn_5min:            '5 minutes',

    // Profile
    profile_title:        'Profil',
    profile_victory:      '✓ Victoire',
    profile_defeat:       '✗ Défaite',

    // StartScreen (mobile)
    start_your_name:      'Votre nom',
    start_player_placeholder: 'Joueur 1',
    start_difficulty:     "Difficulté de l'IA",
    start_btn:            'Commencer la partie',
    start_loading:        'Chargement…',
    start_edition:        'Édition de Luxe — 1972',
    start_subtitle:       'Le jeu classique des mots croisés',
  },

  en: {
    // Navbar
    nav_play:          'Play',
    nav_leaderboard:   'Leaderboard',
    nav_profile:       'Profile',
    nav_settings:      'Settings',
    nav_login:         'Log in',
    nav_register:      'Sign up',
    nav_logout:        'Log out',

    // Theme
    theme_light:       'Light',
    theme_dark:        'Dark',
    theme_system:      'System',

    // SettingsPage — sections
    settings_title:       'Settings',
    settings_subtitle:    'Preferences are saved automatically',
    section_appearance:   'Appearance',
    section_game:         'Game',
    section_display:      'Display',
    section_behavior:     'Behaviour',
    section_language:     'Language',

    // SettingsPage — rows
    row_theme:            'Theme',
    row_theme_desc:       'Choose between light, dark, or your system preference.',
    row_difficulty:       'AI Difficulty',
    row_difficulty_desc:  'Level of the AI opponent.',
    row_turn_duration:    'Turn Duration',
    row_turn_duration_desc: 'Time allowed per turn. 0 = unlimited.',
    row_score_preview:    'Score Preview',
    row_score_preview_desc: 'Show the potential score before confirming.',
    row_remaining_tiles:  'Remaining Tiles',
    row_remaining_tiles_desc: 'Show the number of tiles left in the bag.',
    row_bonus_labels:     'Bonus Square Labels',
    row_bonus_labels_desc: 'Show 2W, 3L, etc. on special squares.',
    row_animations:       'Animations',
    row_animations_desc:  'Transitions and visual effects.',
    row_auto_sort:        'Auto-sort Rack',
    row_auto_sort_desc:   'Sort rack letters alphabetically.',
    row_confirm_validation: 'Confirm Before Submit',
    row_confirm_validation_desc: 'Ask for confirmation before submitting a word.',
    row_language:         'Interface Language',
    row_language_desc:    'French or English.',

    // Reset
    btn_reset:            'Reset all settings',
    confirm_reset:        'Confirm reset?',
    btn_cancel:           'Cancel',
    btn_confirm_reset:    'Reset',

    // Sync badge
    sync_syncing:         '⟳ Syncing…',
    sync_saved:           '✓ Saved',
    sync_not_synced:      'Not synced',
    sync_guest:           'Guest mode — log in to sync',

    // Difficulty
    diff_beginner_label:  'Beginner',
    diff_beginner_desc:   'Very short words, many mistakes',
    diff_easy_label:      'Easy',
    diff_easy_desc:       'Short words, ignores bonus squares',
    diff_medium_label:    'Medium',
    diff_medium_desc:     'Balanced, uses some bonuses',
    diff_hard_minus_label:'Hard',
    diff_hard_minus_desc: 'Long words, all bonuses, few mistakes',
    diff_hard_label:      'Expert',
    diff_hard_desc:       'Maximises every score, all bonuses',

    // GamePage
    score_preview_label:  'Score Preview',
    tiles_label:          'tile',
    tiles_label_plural:   'tiles',
    placed_label:         'placed',
    placed_label_plural:  'placed',
    btn_validate:         'Submit',
    btn_pass:             'Pass',
    btn_exchange:         'Exchange',
    btn_resign:           'Resign',
    ai_thinking:          'AI is thinking…',

    // Turn options
    turn_unlimited:       'Unlimited',
    turn_1min:            '1 minute',
    turn_2min:            '2 minutes',
    turn_3min:            '3 minutes',
    turn_5min:            '5 minutes',

    // Profile
    profile_title:        'Profile',
    profile_victory:      '✓ Win',
    profile_defeat:       '✗ Loss',

    // StartScreen (mobile)
    start_your_name:      'Your name',
    start_player_placeholder: 'Player 1',
    start_difficulty:     'AI Difficulty',
    start_btn:            'Start Game',
    start_loading:        'Loading…',
    start_edition:        'Luxury Edition — 1972',
    start_subtitle:       'The classic crossword board game',
  },
};

export const LANGUAGES = [
  { value: 'fr', label: 'Français', emoji: '🇫🇷' },
  { value: 'en', label: 'English',  emoji: '🇬🇧' },
];