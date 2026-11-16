import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

export type Cargado = {
  id: string
  cuando: string
  /** En una línea, para la compu. */
  texto: string
  /** Para la lista del celular: qué es, el dato principal y el detalle. */
  tipo: 'plata' | 'lluvia' | 'recorrida'
  titulo: string
  valor: string | null
  detalle: string | null
}

/**
 * Lo último que cargó la persona (gastos, lluvias, recorridas), lo de ella sola:
 * para el que sólo manda (compu) y para «Lo que cargaste» del Hoy en el celular.
 */
export function useLoUltimoMio({ plata, campos, cuantos = 5 }: { plata: boolean; campos: boolean; cuantos?: number }) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lo-que-mandaste', user?.id, plata, campos, cuantos],
    enabled: !!user,
    queryFn: async (): Promise<Cargado[]> => {
      const nada = Promise.resolve({ data: [], error: null })
      const [m, l, r] = await Promise.all([
        plata ? supabase.from('movimiento_financiero').select('id, descripcion, monto, created_at, estado').eq('created_by', user!.id).neq('estado', 'anulado').order('created_at', { ascending: false }).limit(cuantos) : nada,
        campos ? supabase.from('lluvia').select('id, mm, created_at, campo(nombre)').eq('created_by', user!.id).order('created_at', { ascending: false }).limit(cuantos) : nada,
        campos ? supabase.from('recorrida').select('id, created_at, campo(nombre)').eq('created_by', user!.id).order('created_at', { ascending: false }).limit(cuantos) : nada,
      ])
      if (m.error) throw m.error
      if (l.error) throw l.error
      if (r.error) throw r.error
      const campoDe = (x: { campo: unknown }) => (x.campo as { nombre: string } | null)?.nombre
      return [
        ...(m.data ?? []).map((x): Cargado => ({ id: x.id, cuando: x.created_at, texto: `${x.descripcion || 'Gasto'} · ${pesos(Number(x.monto))}${x.estado === 'pendiente' ? ' · a pagar' : ''}`, tipo: 'plata', titulo: x.descripcion || 'Gasto', valor: pesos(Number(x.monto)), detalle: x.estado === 'pendiente' ? 'A pagar' : null })),
        ...(l.data ?? []).map((x): Cargado => ({ id: x.id, cuando: x.created_at, texto: `Lluvia · ${Number(x.mm)} mm${campoDe(x) ? ` en ${campoDe(x)}` : ''}`, tipo: 'lluvia', titulo: 'Lluvia', valor: `${Number(x.mm)} mm`, detalle: campoDe(x) ?? null })),
        ...(r.data ?? []).map((x): Cargado => ({ id: x.id, cuando: x.created_at, texto: `Recorrida${campoDe(x) ? ` de ${campoDe(x)}` : ''}`, tipo: 'recorrida', titulo: 'Recorrida', valor: null, detalle: campoDe(x) ?? null })),
      ]
        .sort((a, b) => b.cuando.localeCompare(a.cuando))
        .slice(0, cuantos)
    },
  })
}


