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
export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
