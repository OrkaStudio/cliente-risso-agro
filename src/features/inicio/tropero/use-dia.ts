import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { usePanoramaInicio } from '../hooks'
import { useParaAtender } from '../para-atender-api'
import { cosasParaHoy, inicioDeCampania } from './dia'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export type LluviaDelCampo = {
  /** mm de los últimos 60 días. */
  total: number
  ultima: { fecha: string; mm: number; fuente: string } | null
}

/** La lluvia anotada de un campo en los últimos 60 días (la recorrida o el WhatsApp). */
export const useLluvia60 = (campoId: string | null) =>
  useQuery({
    queryKey: ['inicio', 'lluvia60', campoId],
    enabled: !!campoId,
    queryFn: async (): Promise<LluviaDelCampo> => {
      const desde = new Date()
      desde.setDate(desde.getDate() - 60)
      const { data, error } = await supabase
        .from('lluvia')
        .select('fecha, mm, fuente')
        .eq('campo_id', campoId!)
        .gte('fecha', ymd(desde))
        .order('fecha', { ascending: false })
      if (error) throw new Error(error.message)
      const xs = data ?? []
      return { total: xs.reduce((s, x) => s + Number(x.mm), 0), ultima: xs[0] ? { ...xs[0], mm: Number(xs[0].mm) } : null }
    },
  })

/** Lo que entró menos lo que salió desde el 1 de julio (la campaña). */
export const useGanadoCampania = () =>
  useQuery({
    queryKey: ['inicio', 'ganado-campania'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('v_flujo_caja').select('neto').gte('mes', inicioDeCampania(new Date()))
      if (error) throw new Error(error.message)
      return (data ?? []).reduce((s, f) => s + (f.neto ?? 0), 0)
    },
  })

/** Cuántas cosas hay para atender hoy: lo mismo que lista el Inicio (y el número de la barra). */
export function useCuantasHoy(): number {
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  if (!panorama.data || !atender.data) return 0
  return cosasParaHoy(atender.data.potreros, panorama.data.vencimientos, atender.data.sinRecorrer).length
}
