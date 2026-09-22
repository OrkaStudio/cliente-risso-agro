/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Opcional: Google Map Tiles API. Sin ella, el satélite es Esri. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
  /** Opcional: MapTiler (satélite Maxar, gratis sin tarjeta). Google tiene prioridad. */
  readonly VITE_MAPTILER_KEY?: string
  /** Opcional: WhatsApp de soporte de Orka, E.164 sin "+" (5492244472369).
   *  Sin ella, el asistente no ofrece "Hablar con una persona". */
  readonly VITE_WHATSAPP_SOPORTE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Commit corto del build (ver `define` en vite.config.ts). 'dev' en local. */
declare const __BUILD_SHA__: string
