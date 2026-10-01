import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Cliente Supabase del lado del navegador.
 *
 * Usa la PUBLISHABLE KEY (pública por diseño). En esta arquitectura SPA el
 * cliente habla directo con Postgres → la RLS es la ÚNICA barrera de datos.
 * El service_role key NUNCA se importa acá ni en ningún módulo del bundle.
 * Ver decisión [[decisiones/agro-stack-vite-spa]].
 *
 * La sesión se persiste por defecto en localStorage (web). En el shell
 * Capacitor conviene migrar a un storage seguro nativo — pendiente, anotado
 * en el CLAUDE.md del repo (no es bloqueante para Track 1 web).
 */
/**
 * La telemetría se manda también al cerrar o recargar la pestaña, y un fetch
 * común se cancela con la página ("Failed to fetch"): el lote se perdía. Con
 * `keepalive` el navegador lo termina de mandar. Sólo para `evento_producto`,
 * cuyos lotes son chicos (el límite de keepalive es 64 KB).
 */
export const fetchConKeepalive: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/rest/v1/evento_producto')) return fetch(input, { ...init, keepalive: true })
  return fetch(input, init)
}

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: fetchConKeepalive },
  },
)
