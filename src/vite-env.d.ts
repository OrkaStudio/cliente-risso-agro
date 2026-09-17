/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Opcional: Google Map Tiles API. Sin ella, el satélite es Esri. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Commit corto del build (ver `define` en vite.config.ts). 'dev' en local. */
declare const __BUILD_SHA__: string
