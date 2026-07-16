import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Checklist de puesta a punto — el corazón de la Fase 1 del Asistente.
 *
 * "Web lista" se deriva de la BASE, no de flags: cada ítem es una query
 * liviana vía RLS (count/head). Cero IA, cero migraciones, siempre exacto —
 * los ticks los marca la realidad de los datos, no el asistente.
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 */

export type ItemChecklist = {
  id: 'campo' | 'potreros' | 'hacienda' | 'tropas' | 'recorrida'
  titulo: string
  /** Sección de la app donde se resuelve (para navegar). */
  ruta: string
  /** Ancla data-guia a clickear para abrir la herramienta (null = solo navegar). */
  accion: string | null
  /** Se hace desde el teléfono, no desde la Oficina. */
  movil?: boolean
  hecho: boolean
}

function head(count: number | null, error: { message: string } | null): number {
  if (error) throw new Error(error.message)
  return count ?? 0
}

export function useChecklist() {
  return useQuery({
    queryKey: ['asistente-checklist'],
    // offlineFirst: sin red falla rápido y el panel muestra el aviso (mismo
    // criterio que el guard de empresa, TASK-042).
    networkMode: 'offlineFirst',
    staleTime: 15_000,
    queryFn: async (): Promise<ItemChecklist[]> => {
      const [campos, potreros, activos, ubicados, recorridas] = await Promise.all([
        supabase
          .from('campo')
          .select('id', { count: 'exact', head: true })
          .not('contorno', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('potrero')
          .select('id', { count: 'exact', head: true })
          .not('poligono', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('animal')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'activo')
          .then((r) => head(r.count, r.error)),
        supabase
          .from('animal')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'activo')
          .not('potrero_id', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('recorrida')
          .select('id', { count: 'exact', head: true })
          .then((r) => head(r.count, r.error)),
      ])

      return [
        {
          id: 'campo',
          titulo: 'Traer el campo del catastro',
          ruta: '/campos',
          accion: 'campos-catastro',
          hecho: campos >= 1,
        },
        {
          id: 'potreros',
          titulo: 'Dibujar los potreros',
          ruta: '/campos',
          accion: null,
          // Umbral del spec: con 2 potreros dibujados el mapa ya trabaja.
          hecho: potreros >= 2,
        },
        {
          id: 'hacienda',
          titulo: 'Cargar la hacienda',
          ruta: '/hacienda',
          accion: 'hacienda-acciones',
          hecho: activos >= 1,
        },
        {
          id: 'tropas',
          titulo: 'Ubicar los animales en sus potreros',
          ruta: '/campos',
          accion: null,
          hecho: ubicados >= 1,
        },
        {
          id: 'recorrida',
          titulo: 'Probar la Recorrida',
          ruta: '/campo/recorrida',
          accion: null,
          movil: true,
          hecho: recorridas >= 1,
        },
      ]
    },
  })
}
