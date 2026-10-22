import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Enregistrement manuel dans src/pwa.js (désactivé dans l'app Capacitor)
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Scrabble',
        short_name: 'Scrabble',
        description: 'Le jeu de lettres classique, en solo contre l\'IA ou en multijoueur.',
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#F5EDD6',
        background_color: '#F5EDD6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['games'],
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Seul l'app shell est mis en cache : l'API (Railway) et Firebase
        // restent en réseau, le jeu a besoin d'une connexion.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Ne jamais intercepter les pages d'auth Firebase (/__/auth/...)
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        // Le bundle principal (Firebase inclus) dépasse la limite par défaut de 2 Mo
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
