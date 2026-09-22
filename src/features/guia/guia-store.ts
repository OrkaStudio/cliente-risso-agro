import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import type { SeccionGuia } from '@/features/guia/pasos'
import { supabase } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'

// Store externo mínimo (idioma de lib/campo-mode): la burbuja del asistente,
// el chip de oferta y el overlay viven en árboles distintos del AppShell →
// sin prop-drilling.
const listeners = new Set<() => void>()
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function avisar() {
  listeners.forEach((l) => l())
}

// ---------------------------------------------------------------------------
// Relanzar el recorrido de la sección actual (chip de oferta / panel).
// `pedida` = contador; el overlay reacciona al cambio.
// ---------------------------------------------------------------------------

let pedida = 0

export function pedirGuia(): void {
  pedida++
  avisar()
}

export function useGuiaPedida(): number {
  return useSyncExternalStore(subscribe, () => pedida, () => 0)
}

// ---------------------------------------------------------------------------
// Volver a ver el recibimiento (desde el panel del asistente).
// ---------------------------------------------------------------------------

let recibimientoPedido = 0

export function pedirRecibimiento(): void {
  recibimientoPedido++
  avisar()
}

export function useRecibimientoPedido(): number {
  return useSyncExternalStore(subscribe, () => recibimientoPedido, () => 0)
}

// ---------------------------------------------------------------------------
// Panel del Asistente (preguntas). El recorrido se relanza DESDE el panel
// (conviven — decisión de Lau, spec del asistente).
// ---------------------------------------------------------------------------

let panelAbierto = false

export function abrirPanel(): void {
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
// Escena activa: hay un velo en pantalla (recibimiento o recorrido). La
// pastilla de puesta a punto y el chip de oferta esperan a que termine — la
// llegada es UN momento por vez, nunca tres cosas encima (TASK-063).
// ---------------------------------------------------------------------------

let escenaActiva = false

export function setEscenaActiva(v: boolean): void {
  if (escenaActiva === v) return
  escenaActiva = v
  avisar()
}

export function useEscenaActiva(): boolean {
  return useSyncExternalStore(subscribe, () => escenaActiva, () => false)
}

// ---------------------------------------------------------------------------
// Persistencia "ya lo vio" — tabla `guia_vista` (user_id, clave), RLS propia.
//
// En la DB y no en localStorage (como venía de TASK-043) porque el
// recibimiento es UNA vez por persona, no por navegador: el productor se
// registra en el teléfono y abre la compu al otro día. Mientras la lista
// carga, o si no hay red, NADA automático aparece (se trata como "visto"):
// mejor no recibir que recibir dos veces. Siempre queda el panel para pedirlo.
// ---------------------------------------------------------------------------

export type ClaveGuia = 'recibimiento' | `recorrido.${SeccionGuia}`

export function claveRecorrido(seccion: SeccionGuia): ClaveGuia {
  return `recorrido.${seccion}`
}

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
