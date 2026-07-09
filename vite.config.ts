import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
