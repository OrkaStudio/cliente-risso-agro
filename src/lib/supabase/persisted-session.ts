import type { Session } from '@supabase/supabase-js'

/**
 * Lee la sesión que supabase-js persiste en localStorage, SIN tocar la red.
 *
 * Por qué existe: `supabase.auth.getSession()` con un token vencido intenta
 * refrescarlo contra el servidor; sin señal esa llamada se cuelga y el arranque
 * queda en "Cargando…" para siempre. En el campo (offline) eso deja al usuario
 * afuera. Leyendo la sesión directo del storage arrancamos al instante con lo
 * que haya; cuando vuelve la red, autoRefreshToken/onAuthStateChange la renuevan.
 * Ver [[clientes/risso-agro/tareas/TASK-042-2026-07-15]].
 *
 * Offline un access_token vencido no es un problema de seguridad: no hay
 * llamadas a datos (todo sale de Dexie) y la RLS sigue siendo la única barrera
 * cuando vuelve la señal. Ver [[decisiones/agro-stack-vite-spa]].
 */
export function leerSesionPersistida(): Session | null {
  try {
    // supabase-js guarda bajo `sb-<ref>-auth-token`. No hardcodeamos el ref.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      const parsed = JSON.parse(raw)
      // Formato actual: la sesión va directo. Legacy: envuelta en currentSession.
      const session: unknown = parsed?.access_token
        ? parsed
        : parsed?.currentSession

      if (
        session &&
        typeof session === 'object' &&
        'access_token' in session &&
        'user' in session
      ) {
        return session as Session
      }
    }
  } catch {
    /* storage bloqueado o JSON corrupto: sin sesión persistida */
  }
  return null
}
