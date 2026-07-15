import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA — que la web CARGUE sin señal (el caso del campo). Un service worker
    // precachea el shell + TODOS los chunks (incluidos los lazy del Modo Campo)
    // y sirve index.html a cualquier navegación offline. Los DATOS ya son
    // offline-first (Dexie/outbox); acá resolvemos que la app en sí exista sin
    // red. Ver [[clientes/risso-agro/tareas/TASK-042-2026-07-15]].
    VitePWA({
      // autoUpdate: al detectar un SW nuevo lo instala y toma control al próximo
      // arranque, sin dejar al usuario clavado en una versión vieja (el riesgo
      // clásico de los service workers).
      registerType: 'autoUpdate',
      // Assets estáticos de public/ que no salen del grafo de imports (los
      // referencia el manifest / <head>), para que también estén offline.
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-maskable.svg',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Risso Agro — Gestión de campo',
        short_name: 'Risso Agro',
        description:
          'Hacienda, recorridas y plata del campo. Funciona sin señal.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b5837',
        theme_color: '#178a55',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache de todo el bundle: js/css/html + fuentes self-hosted (ttf) +
        // svg + los íconos png. Así la app entera (Oficina y Campo) queda
        // disponible offline tras la primera visita con señal.
        globPatterns: ['**/*.{js,css,html,svg,ttf,png,webmanifest}'],
        // Cualquier navegación SPA sin red cae al shell cacheado (index.html);
        // React Router resuelve la ruta desde ahí.
        navigateFallback: '/index.html',
        // El vendor chunk pesa ~530 kB → subimos el techo de precache (default 2 MB).
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Al activarse un SW nuevo, borrar los precaches viejos (evita servir
        // assets de builds anteriores).
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // SIN runtime caching de Supabase ni de los tiles satelitales (Esri):
        // son cross-origin y los datos ya los maneja Dexie/react-query. Cachear
        // la API mentiría con datos viejos; sin red, esas requests fallan y la
        // capa offline-first responde con lo local.
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separar vendor en chunks estables (cambian poco → mejor caching web).
        // En Capacitor es neutral (assets locales), pero no molesta.
        // Rolldown (Vite 8) sólo admite la forma función.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase-vendor'
          if (id.includes('@tanstack')) return 'query-vendor'
          // Dexie sólo lo usa el Modo Campo (manga, ruta lazy) → su propio
          // chunk para no cargarlo en el bundle inicial del login/Oficina.
          if (/[\\/]node_modules[\\/]dexie[\\/]/.test(id)) return 'manga-vendor'
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'react-vendor'
          // Leaflet-Geoman referencia el global `L` al evaluarse y sólo se usa
          // en el mapa (ruta lazy). Se carga dinámico tras exponer window.L →
          // que quede en su chunk propio, NO en el vendor que carga en cada
          // página (si no, "L is not defined" rompe toda la app en prod).
          if (id.includes('@geoman-io')) return
          return 'vendor'
        },
      },
    },
  },
})
