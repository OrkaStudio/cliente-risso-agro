import { useQuery } from '@tanstack/react-query'
import {
  itemsDe,
  type CampoSinContorno,
  type EstadoPuestaAPunto,
  type Resumen,
} from '@/features/guia/estado'
import { supabase } from '@/lib/supabase/client'

export type { CampoSinContorno, EstadoPuestaAPunto, ItemChecklist, Resumen } from '@/features/guia/estado'

/**
 * Puesta a punto — el corazón de la Fase 1 del Asistente.
 *
 * "Web lista" se deriva de la BASE, no de flags: cada ítem es una query
 * liviana vía RLS (count/head). Cero IA, cero migraciones, siempre exacto —
 * los ticks los marca la realidad de los datos, no el asistente.
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 *
 * Desde TASK-063 el mismo hook expone un `resumen` con los números crudos:
 * lo leen el recibimiento y los recorridos para hablarle al productor de LO
 * SUYO ("tus 120 cabezas", "los 8 potreros de La Porteña") en vez de a una
 * pantalla vacía.
 */

function head(count: number | null, error: { message: string } | null): number {
  if (error) throw new Error(error.message)
  return count ?? 0
}

export function useEstadoPuestaAPunto() {
  return useQuery({
    queryKey: ['asistente-checklist'],
    // offlineFirst: sin red falla rápido y el panel muestra el aviso (mismo
    // criterio que el guard de empresa, TASK-042).
    networkMode: 'offlineFirst',
    staleTime: 15_000,
    queryFn: async (): Promise<EstadoPuestaAPunto> => {
      const [
        campos,
        sinContorno,
        potreros,
        potrerosDibujados,
        activos,
        ubicados,
        recorridas,
        alquilados,
        conAlquiler,
      ] = await Promise.all([
        supabase
          .from('campo')
          .select('id', { count: 'exact', head: true })
          .then((r) => head(r.count, r.error)),
        // Nombre y provincia de los que faltan: el paso se llama por el campo
        // y el consejo del catastro depende de dónde está (no de dónde vive
        // el dueño).
        supabase
          .from('campo')
          .select('id, nombre, provincia')
          .is('contorno', null)
          .order('created_at', { ascending: true })
          .then((r) => {
            if (r.error) throw new Error(r.error.message)
            return (r.data ?? []) as CampoSinContorno[]
          }),
        supabase
          .from('potrero')
          .select('id', { count: 'exact', head: true })
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
        // Campos alquilados: el alquiler es un gasto recurrente que se pide
        // acá, no en el onboarding (cuando tiene el contrato a mano).
        supabase
          .from('campo')
          .select('id, nombre')
          .eq('tipo', 'alquilado')
          .then((r) => {
            if (r.error) throw new Error(r.error.message)
            return r.data ?? []
          }),
        supabase
          .from('movimiento_financiero')
          .select('campo_id, categoria:categoria_movimiento!inner(nombre)')
          .eq('categoria.nombre', 'Alquiler de campo')
          .then((r) => {
            if (r.error) throw new Error(r.error.message)
            return new Set((r.data ?? []).map((m) => m.campo_id))
          }),
      ])

      const resumen: Resumen = {
        campos,
        sinContorno,
        potreros,
        potrerosDibujados,
        cabezas: activos,
        sinPotrero: Math.max(activos - ubicados, 0),
        alquilados: alquilados.length,
        alquilerPendiente: alquilados.filter((c) => !conAlquiler.has(c.id)),
        recorridas,
      }

      return { items: itemsDe(resumen), resumen }
    },
  })
}
