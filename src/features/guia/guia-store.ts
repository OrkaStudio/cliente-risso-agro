import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'
import { registrar } from '@/lib/telemetria'
import { useIsMobile } from '@/lib/use-is-mobile'

// Store externo mínimo (idioma de lib/campo-mode): la burbuja del asistente,
// la invitación, la misión en curso y la pastilla viven en árboles distintos
// del AppShell → sin prop-drilling.
const listeners = new Set<() => void>()
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function avisar() {
  listeners.forEach((l) => l())
}

// ---------------------------------------------------------------------------
// Panel del Asistente (preguntas + WhatsApp + misión pendiente).
// ---------------------------------------------------------------------------

let panelAbierto = false

// Un solo asistente: mientras el del mapa acompaña Campos, «Preguntale al
// asistente» abre el suyo, con las dudas de ese paso, y no un panel aparte.
let ayudaLocal: (() => void) | null = null

/** El asistente que acompaña la pantalla toma la ayuda; devuelve cómo soltarla. */
export function registrarAyudaLocal(abrir: () => void): () => void {
  ayudaLocal = abrir
  avisar()
  return () => {
    if (ayudaLocal !== abrir) return
    ayudaLocal = null
    avisar()
  }
}

export function useHayAyudaLocal(): boolean {
  return useSyncExternalStore(subscribe, () => ayudaLocal !== null, () => false)
}

export function abrirPanel(): void {
  if (ayudaLocal) {
    registrar('asistente_abierto')
    ayudaLocal()
    return
  }
  if (!panelAbierto) registrar('asistente_abierto')
  panelAbierto = true
  avisar()
}

export function cerrarPanel(): void {
  panelAbierto = false
  avisar()
}

export function usePanelAbierto(): boolean {
  return useSyncExternalStore(subscribe, () => panelAbierto, () => false)
}

// ---------------------------------------------------------------------------
// Persistencia "ya lo vio" — tabla `guia_vista` (user_id, clave), RLS propia.
//
// En la DB y no en localStorage (como venía de TASK-043) porque la
// invitación es UNA vez por persona, no por navegador: el productor se
// registra en el teléfono y abre la compu al otro día. Mientras la lista
// carga, o si no hay red, NADA automático aparece (se trata como "visto"):
// mejor no invitar que invitar dos veces. Siempre queda el panel para pedirlo.
// ---------------------------------------------------------------------------

/** Vocabulario cerrado (comentado también en la migración):
 *  - `recibimiento`: la invitación de llegada ya se respondió (Dale o Después).
 *  - `spot.<ancla>`: el puntito de ese panel ya se tocó.
 *  - `presentacion`: el asistente ya se presentó (bienvenida del mapa en Campos). */
export type ClaveGuia = 'recibimiento' | 'presentacion' | `spot.${string}`

function queryKey(userId: string) {
  return ['guia-vista', userId] as const
}

export function useGuiasVistas() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  return useQuery({
    queryKey: queryKey(userId),
    enabled: !!userId,
    networkMode: 'offlineFirst',
    staleTime: Infinity,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('guia_vista').select('clave')
      if (error) throw new Error(error.message)
      return new Set((data ?? []).map((r) => r.clave))
    },
  })
}

/** `true` cuando se SABE que no la vio. Cargando, sin red o sin usuario →
 *  `false`: nada automático hasta tener el dato. */
export function usePendiente(clave: ClaveGuia): boolean {
  const vistas = useGuiasVistas()
  return vistas.isSuccess && !vistas.data.has(clave)
}

/** Marca una clave como vista: upsert en la DB con el cache actualizado
 *  antes de la respuesta (la UI no espera a la red). Si el upsert falla se
 *  deja el cache marcado igual — en esta sesión ya la vio; la próxima carga
 *  la vuelve a ofrecer, que es inofensivo. */
export function useMarcarVista() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const esMovil = useIsMobile()
  const userId = user?.id ?? ''
  return useMutation({
    mutationFn: async (clave: ClaveGuia) => {
      if (!userId) return
      const { error } = await supabase.from('guia_vista').upsert(
        {
          user_id: userId,
          clave,
          visto_at: new Date().toISOString(),
          dispositivo: esMovil ? 'movil' : 'escritorio',
        },
        { onConflict: 'user_id,clave' },
      )
      if (error) throw new Error(error.message)
    },
    onMutate: (clave) => {
      qc.setQueryData<Set<string>>(queryKey(userId), (prev) => {
        const next = new Set(prev ?? [])
        next.add(clave)
        return next
      })
    },
  }).mutate
}
