import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'

/** Hace N días, en ISO (para filtrar por created_at o fecha). */
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

export type CargaDeOtro = { id: string; descripcion: string; monto: number; tipo: string; cuando: string; por: string; canal: string }

/**
 * Lo que cargó la gente del campo y todavía no se miró (la marca «Nuevo» de
 * Plata): va a «Para hacer hoy» de quien carga la plata (Lau, 16/11).
 */
export function useGenteParaRevisar(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['movimientos', 'hoy-para-revisar', user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<CargaDeOtro[]> => {
      const { data, error } = await supabase
        .from('movimiento_financiero')
        .select('id, descripcion, monto, tipo, created_at, created_by, canal')
        .is('revisado_at', null)
        .neq('estado', 'anulado')
        .neq('created_by', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []).filter((x) => x.created_by).map((x) => ({ id: x.id, descripcion: x.descripcion ?? '', monto: Number(x.monto), tipo: x.tipo, cuando: x.created_at, por: x.created_by!, canal: x.canal }))
    },
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
