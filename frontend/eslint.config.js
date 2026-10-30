import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android', 'ios']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Contextes : chaque fichier exporte son Provider ET le hook qui le lit
    // (useAuth, useLanguage…). C'est le schéma React habituel ; seul effet :
    // modifier un de ces fichiers recharge la page en dev au lieu d'un
    // rechargement à chaud. Les autres exports restent interdits.
    files: ['src/context/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: [
          'useAuth', 'useLanguage', 'useSettings', 'useTheme',
          'useTutorialContext', 'useTutorialRef', 'useNotifications',
        ],
      }],
    },
  },
  {
    // Service worker (notifications push, lot 7) : globales du service worker
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Scripts Node (CI, outils) : globales Node, pas de règles React
    files: ['scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])
