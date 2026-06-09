// src/i18n/translations.js
// Toutes les chaînes UI — ajouter une langue = ajouter une entrée ici.
// Conventions :
//   nav_*        → Navbar
//   theme_*      → libellés thème
//   section_*    → titres de section SettingsPage
//   row_*        → lignes paramètres
//   diff_*       → niveaux difficulté IA
//   sync_*       → badge synchronisation
//   btn_*        → boutons génériques
//   turn_*       → durées de tour
//   legend_*     → légende plateau
//   start_*      → écran démarrage
//   game_*       → GamePage / GameScreen
//   profile_*    → ProfilePage (général)
//   tab_*        → onglets ProfilePage
//   field_*      → champs formulaire profil
//   stat_*       → cartes statistiques
//   history_*    → tableau historique
//   lb_*         → LeaderboardPage
//   login_*      → LoginPage
//   register_*   → RegisterPage
//   auth_*       → partagé Login + Register

export const translations = {

  // ════════════════════════════════════════════════════════════════
  fr: {

    // ── Navbar ────────────────────────────────────────────────────
    nav_play:        'Jouer',
    nav_leaderboard: 'Classement',
    nav_profile:     'Profil',
    nav_settings:    'Paramètres',
    nav_login:       'Connexion',
    nav_register:    'Inscription',
    nav_logout:      'Déconnexion',
    nav_appearance:  'Apparence',
    nav_currently:   'Actuellement',

    // ── Thème ─────────────────────────────────────────────────────
    theme_light:  'Clair',
    theme_dark:   'Sombre',
    theme_system: 'Système',

    // ── SettingsPage ──────────────────────────────────────────────
    settings_title:    'Paramètres',
    settings_subtitle: 'Les préférences sont sauvegardées automatiquement',

    section_appearance: 'Apparence',
    section_game:       'Partie',
    section_display:    'Affichage',
    section_behavior:   'Comportement',

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

    // ── Boutons génériques ────────────────────────────────────────
    btn_reset:         'Réinitialiser tous les paramètres',
    btn_cancel:        'Annuler',
    btn_confirm_reset: 'Réinitialiser',
    btn_validate:      'Valider',
    btn_pass:          'Passer',
    btn_exchange:      'Échanger',
    btn_resign:        'Abandonner',
    confirm_reset:     'Confirmer la réinitialisation ?',

    // ── Sync badge ────────────────────────────────────────────────
    sync_syncing:    '⟳ Synchronisation…',
    sync_saved:      '✓ Sauvegardé',
    sync_not_synced: 'Non synchronisé',
    sync_guest:      'Mode invité — connectez-vous pour synchroniser',

    // ── Difficultés ───────────────────────────────────────────────
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

    // ── Durées de tour ────────────────────────────────────────────
    turn_unlimited: 'Illimité',
    turn_1min:      '1 minute',
    turn_2min:      '2 minutes',
    turn_3min:      '3 minutes',
    turn_5min:      '5 minutes',

    // ── Légende plateau ───────────────────────────────────────────
    legend_tw: 'Triple mot',
    legend_dw: 'Double mot',
    legend_tl: 'Triple lettre',
    legend_dl: 'Double lettre',

    // ── Écran démarrage ───────────────────────────────────────────
    start_edition:            'Édition de Luxe — 1972',
    start_subtitle:           'Le jeu classique des mots croisés',
    start_btn:                'Démarrer la partie',
    start_loading:            'Démarrage…',
    start_change_in:          'Modifiable dans',
    start_your_name:          'Votre nom',
    start_player_placeholder: 'Joueur 1',
    start_difficulty:         "Difficulté de l'IA",

    // ── GamePage ──────────────────────────────────────────────────
    game_score_preview:   'Aperçu du score',
    game_tiles_singular:  'tuile',
    game_tiles_plural:    'tuiles',
    game_placed_singular: 'posée',
    game_placed_plural:   'posées',
    game_swap_selected:   "sélectionnée(s) pour l'échange",
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

    // ── ProfilePage — général ─────────────────────────────────────
    profile_title:            'Mon profil',
    profile_incomplete_banner:"Complétez votre profil pour apparaître dans le classement.",
    profile_complete_btn:     'Compléter',
    profile_complete_badge:   '✓ Profil complet',
    profile_incomplete_badge: '⚠ Profil incomplet',
    profile_change_avatar:    'Changer la photo',
    profile_edit_btn:         'Modifier',
    profile_save_btn:         'Sauvegarder le profil',
    profile_saving:           'Sauvegarde…',
    profile_save_success:     'Profil sauvegardé !',
    profile_save_error:       'Erreur lors de la sauvegarde.',
    profile_victory:          '✓ Victoire',
    profile_defeat:           '✗ Défaite',

    // ── ProfilePage — onglets ─────────────────────────────────────
    tab_profile: 'Profil',
    tab_stats:   'Statistiques',
    tab_history: 'Historique',

    // ── ProfilePage — champs formulaire ──────────────────────────
    field_firstname:          'Prénom',
    field_lastname:           'Nom',
    field_username:           'Pseudo',
    field_age:                'Âge',
    field_age_unit:           'ans',
    field_country:            'Pays',
    field_country_placeholder:'Sélectionnez un pays',
    field_email:              'E-mail',
    field_bio:                'Bio',
    field_bio_placeholder:    'Quelques mots sur vous…',

    // ── ProfilePage — statistiques ────────────────────────────────
    stat_games_played: 'Parties jouées',
    stat_wins:         'Victoires',
    stat_win_rate:     'Taux de victoire',
    stat_best_score:   'Meilleur score',
    stat_avg_score:    'Score moyen',
    stat_best_word:    'Meilleur mot',

    // ── ProfilePage — historique ──────────────────────────────────
    history_date:      'Date',
    history_opponent:  'Adversaire',
    history_score:     'Score',
    history_result:    'Résultat',
    history_best_word: 'Meilleur mot',
    history_empty:     "Aucune partie enregistrée pour l'instant.",

    // ── LeaderboardPage ───────────────────────────────────────────
    lb_title:              'Classement',
    lb_subtitle_players:   'joueurs inscrits',
    lb_filter_period:      'Période',
    lb_filter_sort:        'Trier par',
    lb_period_all:         'Tout temps',
    lb_period_month:       'Ce mois',
    lb_period_week:        'Cette semaine',
    lb_sort_best:          'Meilleur score',
    lb_sort_avg:           'Score moyen',
    lb_sort_wins:          'Victoires',
    lb_sort_played:        'Parties jouées',
    lb_your_rank:          'Votre rang',
    lb_col_player:         'Joueur',
    lb_col_played:         'Parties',
    lb_col_wins:           'Victoires',
    lb_col_winrate:        'V%',
    lb_col_best:           'Meilleur',
    lb_col_avg:            'Moyen',
    lb_you:                'Vous',
    lb_empty:              'Aucun joueur pour cette période.',

    // ── LoginPage ─────────────────────────────────────────────────
    login_subtitle:        'Connexion',
    login_email:           'Adresse email',
    login_email_ph:        'vous@exemple.com',
    login_password:        'Mot de passe',
    login_btn:             'Se connecter',
    login_loading:         'Connexion…',
    login_create_account:  'Créer un compte',
    login_forgot_password: 'Mot de passe oublié ?',

    // ── RegisterPage ──────────────────────────────────────────────
    register_subtitle:        'Créer un compte',
    register_username:        'Pseudo',
    register_username_ph:     'Votre nom de joueur',
    register_pw_ph:           '6 caractères minimum',
    register_confirm_pw:      'Confirmer le mot de passe',
    register_btn:             'Créer mon compte',
    register_loading:         'Création…',
    register_already_account: 'Déjà un compte ?',
    register_login_link:      'Se connecter',
    register_err_name_short:  'Le pseudo doit contenir au moins 2 caractères.',
    register_err_name_long:   'Le pseudo ne peut pas dépasser 32 caractères.',
    register_err_email:       'Email invalide.',
    register_err_pw_short:    'Mot de passe trop court (6 caractères minimum).',
    register_err_pw_match:    'Les mots de passe ne correspondent pas.',

    // ── Auth partagé ──────────────────────────────────────────────
    auth_or:     'ou',
    auth_google: 'Continuer avec Google',

    // ── Tutoriel ─────────────────────────────────────────────────
    tuto_skip:  'Passer',
    tuto_prev:  'Précédent',
    tuto_next:  'Suivant',
    tuto_finish: 'Terminer',
    tuto_open_btn_title: 'Aide & tutoriel',
  
    tuto_step0_title: 'Bienvenue sur Scrabble !',
    tuto_step0_body:  'Ce tutoriel vous guidera à travers les bases du jeu en quelques étapes. Vous pouvez le relancer à tout moment via le bouton « ? ».',
  
    tuto_step1_title: 'Le plateau de jeu',
    tuto_step1_body:  'Le plateau est une grille de 15×15 cases. Les mots doivent s\'y croiser, comme dans des mots croisés. La partie commence toujours par la case centrale.',
  
    tuto_step2_title: 'La case centrale ★',
    tuto_step2_body:  'Le premier mot posé doit obligatoirement passer par l\'étoile au centre du plateau. Cela double automatiquement le score du premier coup !',
  
    tuto_step3_title: 'Les cases bonus',
    tuto_step3_body:  '🟥 TM = Triple Mot · 🟧 DM = Double Mot · 🟦 TL = Triple Lettre · 🔷 DL = Double Lettre. Positionnez vos tuiles sur ces cases pour multiplier votre score.',
  
    tuto_step4_title: 'Votre chevalet',
    tuto_step4_body:  'Vous avez 7 lettres en main. Glissez-les sur le plateau pour former un mot. Poser les 7 lettres d\'un coup rapporte un bonus de 50 points (Bingo) !',
  
    tuto_step5_title: 'Aperçu du score',
    tuto_step5_body:  'Pendant que vous posez vos tuiles, le score estimé s\'affiche ici en temps réel. Il inclut les multiplicateurs des cases bonus.',
  
    tuto_step6_title: 'Valider votre mot',
    tuto_step6_body:  'Une fois vos lettres posées, cliquez sur « Valider » pour soumettre le mot. S\'il est invalide ou mal placé, les tuiles reviennent dans votre chevalet.',
  
    tuto_step7_title: 'Passer son tour',
    tuto_step7_body:  'Si vous ne pouvez pas ou ne voulez pas jouer, passez votre tour. Après 6 passes consécutives (tous joueurs confondus), la partie se termine.',
  
    tuto_step8_title: 'Tableau des scores',
    tuto_step8_body:  'Suivez l\'évolution des scores ici. Le joueur dont le nom est surligné est celui dont c\'est le tour. Bonne chance !',
    tuto_action_required: 'Action requise',
    tuto_waiting:         'En attente…',
    tuto_step4_hint:      'Essayez : glissez une lettre sur le plateau',
    tuto_step6_hint:      'Essayez : cliquez sur Valider',
    tuto_progress_label: 'Progression du tutoriel',
    tuto_hint_label:     'Conseil',
    tuto_step_label:     'Étape',
    tuto_step_of:        'sur',
    tuto_skip_aria:      'Fermer le tutoriel',
    tuto_prev_aria:      'Étape précédente',
    tuto_next_aria:      'Étape suivante',
    tuto_finish_aria:    'Terminer le tutoriel',
  },

  // ════════════════════════════════════════════════════════════════
  en: {

    // ── Navbar ────────────────────────────────────────────────────
    nav_play:        'Play',
    nav_leaderboard: 'Leaderboard',
    nav_profile:     'Profile',
    nav_settings:    'Settings',
    nav_login:       'Log in',
    nav_register:    'Sign up',
    nav_logout:      'Log out',
    nav_appearance:  'Appearance',
    nav_currently:   'Currently',

    // ── Theme ─────────────────────────────────────────────────────
    theme_light:  'Light',
    theme_dark:   'Dark',
    theme_system: 'System',

    // ── SettingsPage ──────────────────────────────────────────────
    settings_title:    'Settings',
    settings_subtitle: 'Preferences are saved automatically',

    section_appearance: 'Appearance',
    section_game:       'Game',
    section_display:    'Display',
    section_behavior:   'Behaviour',

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

    // ── Generic buttons ───────────────────────────────────────────
    btn_reset:         'Reset all settings',
    btn_cancel:        'Cancel',
    btn_confirm_reset: 'Reset',
    btn_validate:      'Submit',
    btn_pass:          'Pass',
    btn_exchange:      'Exchange',
    btn_resign:        'Resign',
    confirm_reset:     'Confirm reset?',

    // ── Sync badge ────────────────────────────────────────────────
    sync_syncing:    '⟳ Syncing…',
    sync_saved:      '✓ Saved',
    sync_not_synced: 'Not synced',
    sync_guest:      'Guest mode — log in to sync',

    // ── Difficulties ──────────────────────────────────────────────
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

    // ── Turn options ──────────────────────────────────────────────
    turn_unlimited: 'Unlimited',
    turn_1min:      '1 minute',
    turn_2min:      '2 minutes',
    turn_3min:      '3 minutes',
    turn_5min:      '5 minutes',

    // ── Board legend ──────────────────────────────────────────────
    legend_tw: 'Triple Word',
    legend_dw: 'Double Word',
    legend_tl: 'Triple Letter',
    legend_dl: 'Double Letter',

    // ── Start screen ──────────────────────────────────────────────
    start_edition:            'Luxury Edition — 1972',
    start_subtitle:           'The classic crossword board game',
    start_btn:                'Start Game',
    start_loading:            'Starting…',
    start_change_in:          'Change in',
    start_your_name:          'Your name',
    start_player_placeholder: 'Player 1',
    start_difficulty:         'AI Difficulty',

    // ── GamePage ──────────────────────────────────────────────────
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

    // ── ProfilePage — general ─────────────────────────────────────
    profile_title:            'My Profile',
    profile_incomplete_banner:'Complete your profile to appear on the leaderboard.',
    profile_complete_btn:     'Complete',
    profile_complete_badge:   '✓ Profile complete',
    profile_incomplete_badge: '⚠ Profile incomplete',
    profile_change_avatar:    'Change photo',
    profile_edit_btn:         'Edit',
    profile_save_btn:         'Save profile',
    profile_saving:           'Saving…',
    profile_save_success:     'Profile saved!',
    profile_save_error:       'Error saving profile.',
    profile_victory:          '✓ Win',
    profile_defeat:           '✗ Loss',

    // ── ProfilePage — tabs ────────────────────────────────────────
    tab_profile: 'Profile',
    tab_stats:   'Statistics',
    tab_history: 'History',

    // ── ProfilePage — form fields ─────────────────────────────────
    field_firstname:          'First name',
    field_lastname:           'Last name',
    field_username:           'Username',
    field_age:                'Age',
    field_age_unit:           'years old',
    field_country:            'Country',
    field_country_placeholder:'Select a country',
    field_email:              'Email',
    field_bio:                'Bio',
    field_bio_placeholder:    'A few words about you…',

    // ── ProfilePage — stats ───────────────────────────────────────
    stat_games_played: 'Games played',
    stat_wins:         'Wins',
    stat_win_rate:     'Win rate',
    stat_best_score:   'Best score',
    stat_avg_score:    'Average score',
    stat_best_word:    'Best word',

    // ── ProfilePage — history ─────────────────────────────────────
    history_date:      'Date',
    history_opponent:  'Opponent',
    history_score:     'Score',
    history_result:    'Result',
    history_best_word: 'Best word',
    history_empty:     'No games recorded yet.',

    // ── LeaderboardPage ───────────────────────────────────────────
    lb_title:              'Leaderboard',
    lb_subtitle_players:   'registered players',
    lb_filter_period:      'Period',
    lb_filter_sort:        'Sort by',
    lb_period_all:         'All time',
    lb_period_month:       'This month',
    lb_period_week:        'This week',
    lb_sort_best:          'Best score',
    lb_sort_avg:           'Average score',
    lb_sort_wins:          'Wins',
    lb_sort_played:        'Games played',
    lb_your_rank:          'Your rank',
    lb_col_player:         'Player',
    lb_col_played:         'Games',
    lb_col_wins:           'Wins',
    lb_col_winrate:        'W%',
    lb_col_best:           'Best',
    lb_col_avg:            'Avg',
    lb_you:                'You',
    lb_empty:              'No players for this period.',

    // ── LoginPage ─────────────────────────────────────────────────
    login_subtitle:        'Log in',
    login_email:           'Email address',
    login_email_ph:        'you@example.com',
    login_password:        'Password',
    login_btn:             'Log in',
    login_loading:         'Logging in…',
    login_create_account:  'Create an account',
    login_forgot_password: 'Forgot password?',

    // ── RegisterPage ──────────────────────────────────────────────
    register_subtitle:        'Create an account',
    register_username:        'Username',
    register_username_ph:     'Your player name',
    register_pw_ph:           'Minimum 6 characters',
    register_confirm_pw:      'Confirm password',
    register_btn:             'Create account',
    register_loading:         'Creating…',
    register_already_account: 'Already have an account?',
    register_login_link:      'Log in',
    register_err_name_short:  'Username must be at least 2 characters.',
    register_err_name_long:   'Username cannot exceed 32 characters.',
    register_err_email:       'Invalid email address.',
    register_err_pw_short:    'Password too short (minimum 6 characters).',
    register_err_pw_match:    'Passwords do not match.',

    // ── Auth partagé ──────────────────────────────────────────────
    auth_or:     'or',
    auth_google: 'Continue with Google',

    // ── Tutorial ─────────────────────────────────────────────────
    tuto_skip:  'Skip',
    tuto_prev:  'Previous',
    tuto_next:  'Next',
    tuto_finish: 'Finish',
    tuto_open_btn_title: 'Help & tutorial',
  
    tuto_step0_title: 'Welcome to Scrabble!',
    tuto_step0_body:  'This tutorial will walk you through the basics of the game in a few steps. You can reopen it at any time using the "?" button.',
  
    tuto_step1_title: 'The game board',
    tuto_step1_body:  'The board is a 15×15 grid. Words must intersect like a crossword puzzle. Every game starts from the center square.',
  
    tuto_step2_title: 'The center square ★',
    tuto_step2_body:  'Your first word must pass through the star at the center of the board. This automatically doubles the score of the opening move!',
  
    tuto_step3_title: 'Bonus squares',
    tuto_step3_body:  '🟥 TW = Triple Word · 🟧 DW = Double Word · 🟦 TL = Triple Letter · 🔷 DL = Double Letter. Place your tiles on these squares to multiply your score.',
  
    tuto_step4_title: 'Your rack',
    tuto_step4_body:  'You have 7 letters in hand. Drag them onto the board to form a word. Playing all 7 tiles at once earns a 50-point bonus (Bingo)!',
  
    tuto_step5_title: 'Score preview',
    tuto_step5_body:  'As you place your tiles, the estimated score updates here in real time — including bonus square multipliers.',
  
    tuto_step6_title: 'Submit your word',
    tuto_step6_body:  'Once your letters are placed, click "Submit" to validate the word. If it\'s invalid or misplaced, the tiles return to your rack.',
  
    tuto_step7_title: 'Pass your turn',
    tuto_step7_body:  'If you can\'t or don\'t want to play, pass your turn. After 6 consecutive passes across all players, the game ends.',
  
    tuto_step8_title: 'Score panel',
    tuto_step8_body:  'Track the score progression here. The highlighted player name is the one whose turn it currently is. Good luck!',
    tuto_action_required: 'Action required',
    tuto_waiting:         'Waiting…',
    tuto_step4_hint:      'Try it: drag a letter onto the board',
    tuto_step6_hint:      'Try it: click Submit',
    tuto_progress_label: 'Tutorial progress',
    tuto_hint_label:     'Tip',
    tuto_step_label:     'Step',
    tuto_step_of:        'of',
    tuto_skip_aria:      'Close the tutorial',
    tuto_prev_aria:      'Previous step',
    tuto_next_aria:      'Next step',
    tuto_finish_aria:    'Finish the tutorial',
  },
};

export const LANGUAGES = [
  { value: 'fr', label: 'Français', emoji: '🇫🇷' },
  { value: 'en', label: 'English',  emoji: '🇬🇧' },
];