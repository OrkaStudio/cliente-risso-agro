import { useQuery } from '@tanstack/react-query'
import { hoyLocal } from '@/lib/fecha'
import { supabase } from '@/lib/supabase/client'
import type { Labor } from './historia'
import type { Lluvia, Observacion } from './panorama'

// Lo que se cargó de un campo, para Campos de la compu y del celular.

/** Una fecha `n` días antes de `hoy` (AAAA-MM-DD). */
export const antes = (hoy: string, n: number) => new Date(Date.parse(hoy) - n * 86_400_000).toISOString().slice(0, 10)
export const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Lo que se cargó del campo: movimientos (días), recorridas (pasto y agua) y lluvia. */
export function useDatosDelCampo(empresaId: string, campoId: string, potreroIds: string[]) {
  return useQuery({
    queryKey: ['campo-datos', campoId, potreroIds.join(',')],
    enabled: !!empresaId && !!campoId,
    queryFn: async () => {
      const desde = antes(hoyLocal(), 365)
      const [movs, obs, ll, lab] = await Promise.all([
        supabase.from('evento').select('animal_id, fecha, datos').eq('empresa_id', empresaId).eq('tipo', 'movimiento'),
        potreroIds.length ? supabase.from('observacion_potrero').select('potrero_id, created_at, pasto, agua, electrico, novedad, created_by, canal').in('potrero_id', potreroIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
        supabase.from('lluvia').select('fecha, mm').eq('campo_id', campoId).gte('fecha', desde),
        potreroIds.length ? supabase.from('labor_potrero').select('potrero_id, fecha, tipo, cultivo, nota, kg_cosechados, created_by, canal').in('potrero_id', potreroIds).order('fecha', { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
      ])
      if (lab.error) throw lab.error
      if (movs.error) throw movs.error
      if (obs.error) throw obs.error
      if (ll.error) throw ll.error
      return {
        movimientos: (movs.data ?? []).map((e) => {
          const d = (e.datos ?? {}) as Record<string, unknown>
          return {
            animalId: e.animal_id,
            fecha: e.fecha,
            origen: (d.potrero_origen_id as string) ?? null,
            destino: (d.potrero_destino_id as string) ?? null,
            origenNombre: (d.potrero_origen as string) ?? null,
            destinoNombre: (d.potrero_destino as string) ?? null,
          }
        }),
        labores: (lab.data ?? []).map((l): Labor => ({ potreroId: l.potrero_id, fecha: l.fecha, tipo: l.tipo, cultivo: l.cultivo, nota: l.nota, kg: l.kg_cosechados, createdBy: l.created_by, canal: l.canal })),
        observaciones: (obs.data ?? []).map((o): Observacion => ({ potreroId: o.potrero_id, fecha: o.created_at.slice(0, 10), pasto: o.pasto, agua: o.agua, electrico: o.electrico, novedad: o.novedad, createdBy: o.created_by, canal: o.canal })),
        lluvias: (ll.data ?? []) as Lluvia[],
      }
    },
  })
}

