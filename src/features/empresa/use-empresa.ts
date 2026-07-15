import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Empresa del usuario actual (multi-tenant). Por ahora un usuario pertenece a
 * una sola empresa; tomamos la primera membresía. La RLS ya garantiza que sólo
 * ve la(s) suya(s).
 */

/** Forma de la membresía tal como la devuelve la query (y la que persistimos). */
export type Membresia = {
  empresa_id: string
  rol: string
  empresa: { id: string; nombre: string } | null
}

// Última membresía conocida, cacheada en localStorage. Sin red no podemos
// preguntar por la membresía; en vez de mandar al onboarding (que borraría la
// experiencia del que ya tiene empresa) usamos la última respuesta buena.
// Ver [[clientes/risso-agro/tareas/TASK-042-2026-07-15]].
const MEMBRESIA_KEY = 'risso.membresia.v1'

/** Lee la última membresía conocida (o null si nunca hubo / se limpió). */
export function leerMembresiaPersistida(): Membresia | null {
  try {
    const raw = localStorage.getItem(MEMBRESIA_KEY)
    return raw ? (JSON.parse(raw) as Membresia) : null
  } catch {
    return null
  }
}

function guardarMembresiaPersistida(m: Membresia | null): void {
  try {
    if (m) localStorage.setItem(MEMBRESIA_KEY, JSON.stringify(m))
    // Confirmado sin empresa (data === null con red): limpiamos el cache para
    // no dejar pasar a alguien que ya no pertenece a ninguna empresa.
    else localStorage.removeItem(MEMBRESIA_KEY)
  } catch {
    /* localStorage lleno o bloqueado: seguimos sin cachear, no es fatal */
  }
}

export function useEmpresa() {
  return useQuery({
    queryKey: ['empresa'],
    // offlineFirst: la query CORRE aunque no haya red (no se queda `paused`).
    // Sin señal el fetch falla → isError, y el guard cae a la membresía
    // persistida en vez de colgarse en "Cargando…" para siempre.
    networkMode: 'offlineFirst',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('miembro_empresa')
        .select('empresa_id, rol, empresa:empresa(id, nombre)')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      guardarMembresiaPersistida(data)
      return data
    },
  })
}
