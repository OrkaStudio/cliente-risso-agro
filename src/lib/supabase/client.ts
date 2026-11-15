import { createClient } from '@supabase/supabase-js'
import { cuentaDelPedido, ENCABEZADO_CUENTA } from '@/features/empresa/cuenta-activa'
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
  // Sólo a la base (PostgREST): las funciones y el storage no lo usan y sus CORS no lo aceptan.
  const conCuenta = url.includes('/rest/v1/') ? conLaCuenta(init) : init
  if (url.includes('/rest/v1/evento_producto')) return fetch(input, { ...conCuenta, keepalive: true })
  return fetch(input, conCuenta)
}

/**
 * Cada pedido a la base lleva la cuenta con la que se trabaja (varias cuentas,
 * 14/11): ve y carga sólo en ésa. Ver `features/empresa/cuenta-activa.ts`.
 */
function conLaCuenta(init: RequestInit | undefined): RequestInit | undefined {
  const cuenta = cuentaDelPedido()
  if (!cuenta) return init
  const headers = new Headers(init?.headers)
  headers.set(ENCABEZADO_CUENTA, cuenta)
  return { ...init, headers }
}

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storageKey: env.supabaseStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: fetchConKeepalive },
  },
)
