import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages sert le site depuis /<nom-du-depot>/ et non depuis la racine.
 * BASE_PATH est injecte par le workflow de deploiement (etape 0.2).
 * En developpement local, la valeur reste '/'.
 */
const base = process.env.BASE_PATH ?? '/';

/**
 * En local, l'API est relayee vers PocketBase : le serveur en ligne si
 * LANCER.bat a trouve le domaine dans deploiement/config.txt (PB_PROXY),
 * sinon un PocketBase lance sur ce PC (port 8090).
 */
const cibleApi = process.env.PB_PROXY || 'http://127.0.0.1:8090';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        id: 'affiches-em',
        name: 'Affiches EM — Marjane Kénitra 2',
        short_name: 'Affiches EM',
        description:
          "Generateur d'affiches prix pour le departement Electromenager : saisie, regles commerciales automatiques, export PDF pret a imprimer.",
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#082a52',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        // L'API et la console PocketBase ne passent jamais par le cache hors ligne.
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: cibleApi, changeOrigin: true },
      '/_/': { target: cibleApi, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
