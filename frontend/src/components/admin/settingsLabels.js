// src/components/admin/settingsLabels.js
// Libellés des paramètres et de leurs options dans le dashboard (lot A2).
// Réutilise les clés de la page Paramètres pour que l'admin voie les mêmes mots
// que les joueurs.

const SETTING_LABELS = {
  themeMode:          'row_theme',
  colorPalette:       'row_palette',
  language:           'row_language',
  difficulty:         'row_difficulty',
  gameLanguage:       'gl_label',
  turnDuration:       'row_turn_duration',
  showScorePreview:   'row_score_preview',
  showRemainingTiles: 'row_remaining_tiles',
  showBonusLabels:    'row_bonus_labels',
  animationsEnabled:  'row_animations',
  autoSortRack:       'row_auto_sort',
  confirmValidation:  'row_confirm_validation',
  pushInvites:        'push_cat_invites',
  pushFriends:        'push_cat_friends',
  pushMessages:       'push_cat_messages',
  pushTurn:           'push_cat_turn',
  pushNews:           'push_cat_news',
};

const TURN_LABELS = { 0: 'turn_unlimited', 60: 'turn_1min', 120: 'turn_2min', 180: 'turn_3min', 300: 'turn_5min' };
const LANGUAGE_NAMES = { fr: 'Français', en: 'English' };

export function settingLabel(key, t) {
  if (key.startsWith('privacy.')) return t(`privacy_${key.slice(8)}`);
  return t(SETTING_LABELS[key] ?? key);
}

export function optionLabel(key, value, t) {
  if (value === null || value === undefined) return t('adm_set_no_default');
  if (typeof value === 'boolean') return value ? t('adm_yes') : t('adm_no');
  switch (key) {
    case 'themeMode':    return t(`theme_${value}`);
    case 'colorPalette': return t(`palette_${value}`);
    case 'language':
    case 'gameLanguage': return LANGUAGE_NAMES[value] ?? value;
    case 'difficulty':   return t(`diff_${value}_label`);
    case 'turnDuration': return t(TURN_LABELS[value] ?? String(value));
    default:             return key.startsWith('privacy.') ? t(`privacy_opt_${value}`) : String(value);
  }
}
