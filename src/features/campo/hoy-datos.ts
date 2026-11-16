import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'

/** Hace N días, en ISO (para filtrar por created_at o fecha). */
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

export type Novedad = { id: string; cuando: string; quien: string; tipo: 'plata' | 'lluvia' | 'recorrida'; titulo: string; detalle: string | null }

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

/** Lo de la observación que vale contar: lo que no está normal. */
function queVio(o: { agua: string | null; pasto: string | null; electrico: string | null; novedad: string | null }): string {
  const partes = [
    o.novedad,
    o.agua && o.agua !== 'normal' ? `agua ${o.agua}` : null,
    o.pasto && o.pasto !== 'normal' ? `pasto ${o.pasto}` : null,
    o.electrico && o.electrico !== 'ok' ? `eléctrico ${o.electrico}` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(', ') : 'todo normal'
}

/**
 * Lo que cargó la gente del campo en la última semana (Hoy del dueño, 16/11):
 * gastos, lluvias y lo que vio en la recorrida, con quién lo cargó. Lo de uno
 * mismo no (eso ya lo sabe). La base deja ver sólo lo de esta cuenta.
 */
export function useLoNuevoDeTuGente({ enabled, nombreDe }: { enabled: boolean; nombreDe: (id: string) => string }) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['hoy-lo-nuevo', user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<(Omit<Novedad, 'quien'> & { por: string })[]> => {
      const desde = haceDias(7)
      const [m, l, o] = await Promise.all([
        supabase.from('movimiento_financiero').select('id, descripcion, monto, tipo, created_at, created_by').neq('created_by', user!.id).gte('created_at', desde).neq('estado', 'anulado').order('created_at', { ascending: false }).limit(10),
        supabase.from('lluvia').select('id, mm, created_at, created_by, campo(nombre)').neq('created_by', user!.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(10),
        supabase.from('observacion_potrero').select('id, agua, pasto, electrico, novedad, created_at, created_by, potrero(nombre)').neq('created_by', user!.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(10),
      ])
      if (m.error) throw m.error
      if (l.error) throw l.error
      if (o.error) throw o.error
      const nombre = (x: { nombre: string } | { nombre: string }[] | null) => (Array.isArray(x) ? x[0]?.nombre : x?.nombre) ?? null
      return [
        ...(m.data ?? []).map((x) => ({ id: x.id, cuando: x.created_at, por: x.created_by!, tipo: 'plata' as const, titulo: `${x.descripcion || (x.tipo === 'ingreso' ? 'Cobro' : 'Gasto')} · ${pesos(Number(x.monto))}`, detalle: null })),
        ...(l.data ?? []).map((x) => ({ id: x.id, cuando: x.created_at, por: x.created_by!, tipo: 'lluvia' as const, titulo: `${Number(x.mm)} mm${nombre(x.campo) ? ` en ${nombre(x.campo)}` : ''}`, detalle: null })),
        ...(o.data ?? []).map((x) => ({ id: x.id, cuando: x.created_at, por: x.created_by!, tipo: 'recorrida' as const, titulo: `${nombre(x.potrero) ?? 'Potrero'} · ${queVio(x)}`, detalle: null })),
      ]
        .filter((x) => x.por)
        .sort((a, b) => b.cuando.localeCompare(a.cuando))
        .slice(0, 5)
    },
    select: (xs) => xs.map(({ por, ...x }) => ({ ...x, quien: nombreDe(por) }) as Novedad),
  })
}

/** Las lluvias del pluviómetro de los últimos 31 días (del campo, o de todos). */
export function useLluviasRegistradas(campoId: string | null) {
  return useQuery({
    queryKey: ['hoy-lluvias', campoId],
    queryFn: async () => {
      let q = supabase.from('lluvia').select('fecha, mm, campo_id').gte('fecha', haceDias(31).slice(0, 10))
      if (campoId) q = q.eq('campo_id', campoId)
      const { data, error } = await q
      if (error) throw error
      // Varios campos el mismo día: el promedio no, el máximo (el que más llovió).
      const porDia = new Map<string, number>()
      for (const x of data ?? []) porDia.set(x.fecha, Math.max(porDia.get(x.fecha) ?? 0, Number(x.mm)))
      return porDia
    },
  })
}
