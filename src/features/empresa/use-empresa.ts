import type { Niveles } from './secciones'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { primeraMayuscula } from '@/lib/texto'
import { queryClient } from '@/lib/query-client'
import { aplicarCambioDeAcceso, cambioElAcceso } from './cambio-de-acceso'
import { fijarCuentaDelPedido, leerCuentaElegida, olvidarCuentaElegida } from './cuenta-activa'

/**
 * La cuenta con la que trabaja el usuario (multi-tenant). Puede estar en varias
 * (un veterinario que atiende varios campos, 14/11): con una sola, es ésa; con
 * varias, la que eligió en este equipo, y si no eligió ninguna se le pregunta
 * (nunca se elige sola). Ver `cuenta-activa.ts`.
 */

/** Forma de la membresía tal como la devuelve la query (y la que persistimos). */
export type Membresia = {
  empresa_id: string
  rol: string
  /** El nivel en cada sección (null = todo: el dueño). Ver `secciones.ts`. */
  niveles?: Niveles | null
  /** «whatsapp»: no usa la app, manda por WhatsApp (permisos, 14/11). */
  acceso?: string
  /** De quién es (sólo en la guardada): otro usuario del mismo equipo no entra con ella. */
  user_id?: string
  empresa: {
    id: string
    nombre: string
    /** null = el dueño todavía no terminó el onboarding. Una membresía
     *  guardada de antes de este campo no lo trae: cuenta como terminado. */
    onboarding_completo_at?: string | null
    /** null = todavía no ubicó sus campos en el mapa (la app queda cerrada). */
    mapa_completo_at?: string | null
    /** Desde cuándo usa Troppero (la pantalla Plan). */
    created_at?: string
  } | null
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

/** Lo que hace falta para entrar: todas sus cuentas y la elegida (null = hay que elegir). */
export type Cuentas = { cuentas: Membresia[]; activa: Membresia | null }

type FilaCuenta = {
  empresa_id: string
  nombre: string
  rol: string
  niveles: unknown
  acceso: string
  onboarding_completo_at: string | null
  mapa_completo_at: string | null
  created_at: string
}

function aMembresia(f: FilaCuenta): Membresia {
  return {
    empresa_id: f.empresa_id,
    rol: f.rol,
    niveles: f.niveles as Niveles | null,
    acceso: f.acceso,
    // El nombre como se lee: primera letra en mayúscula aunque se haya cargado «risso Agro».
    empresa: {
      id: f.empresa_id,
      nombre: primeraMayuscula(f.nombre),
      onboarding_completo_at: f.onboarding_completo_at,
      mapa_completo_at: f.mapa_completo_at,
      created_at: f.created_at,
    },
  }
}

/** La cuenta elegida entre las suyas: la única, o la que eligió en este equipo y sigue siendo suya. */
export function cuentaActiva(cuentas: Membresia[], elegida: string | null): Membresia | null {
  if (cuentas.length === 1) return cuentas[0]!
  return cuentas.find((c) => c.empresa_id === elegida) ?? null
}

const opcionesCuentas = queryOptions({
  queryKey: ['empresa'],
  // offlineFirst: la query CORRE aunque no haya red (no se queda `paused`).
  // Sin señal el fetch falla → isError, y el guard cae a la membresía
  // persistida en vez de colgarse en "Cargando…" para siempre.
  networkMode: 'offlineFirst',
  // Que un cambio de acceso llegue rápido (Lau, 19/11): se vuelve a pedir al volver a la
  // app (el celular la deja en segundo plano), cada minuto mientras está abierta y al
  // pasar de pantalla después de 10 s. Es una consulta chica.
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
  queryFn: async (): Promise<Cuentas> => {
    const antes = queryClient.getQueryData<Cuentas>(['empresa'])?.activa
    const [{ data, error }, { data: sesion }] = await Promise.all([
      supabase.rpc('mis_cuentas'),
      supabase.auth.getSession(),
    ])
    if (error) throw error
    const cuentas = ((data ?? []) as FilaCuenta[]).map(aMembresia)
    const userId = sesion.session?.user.id ?? null
    const elegida = userId ? leerCuentaElegida(userId) : null
    // Una elegida que ya no es suya (lo sacaron) se olvida: si vuelve a tener varias, se pregunta.
    if (userId && elegida && !cuentas.some((c) => c.empresa_id === elegida)) olvidarCuentaElegida(userId)
    const activa = cuentaActiva(cuentas, elegida)
    // Desde acá cada pedido a la base va con esta cuenta (o con ninguna, si hay que elegir).
    fijarCuentaDelPedido(activa?.empresa_id ?? null)
    // Sin cuenta elegida no queda ninguna guardada: sin señal no se entra a una al azar.
    guardarMembresiaPersistida(activa && userId ? { ...activa, user_id: userId } : null)
    // El dueño le cambió el acceso mientras tenía la app abierta: después de guardar esto.
    if (cambioElAcceso(antes, activa)) setTimeout(() => aplicarCambioDeAcceso(antes!, activa!), 0)
    return { cuentas, activa }
  },
})

/** Todas sus cuentas y la elegida. */
export function useCuentas() {
  return useQuery(opcionesCuentas)
}

/** La cuenta con la que se trabaja (null = ninguna: sin cuentas, o con varias y sin elegir). */
export function useEmpresa() {
  return useQuery({ ...opcionesCuentas, select: (d: Cuentas) => d.activa })
}
