import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { usePanoramaInicio } from '../hooks'
import { useParaAtender } from '../para-atender-api'
import { cosasParaHoy, DIAS_DE_LLUVIA, inicioDeCampania, lluviaDelMes, type DiaLluvia } from './dia'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * La lluvia del último mes (30 días) en la ubicación del campo, según Open-Meteo. Es la
 * única fuente de la lluvia: el saludo, la tarjeta, el clima y el Hoy dicen el
 * mismo número. No se carga a mano (decisión del 10/10).
 */
export const useLluvia60 = (ubicacion: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: ['inicio', 'lluvia-pronostico', ubicacion?.lat, ubicacion?.lon],
    enabled: !!ubicacion,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    queryFn: async (): Promise<number> => {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${ubicacion!.lat}&longitude=${ubicacion!.lon}&daily=precipitation_sum&past_days=${DIAS_DE_LLUVIA + 1}&forecast_days=1&timezone=America/Argentina/Buenos_Aires`,
      )
      if (!r.ok) throw new Error(`open-meteo ${r.status}`)
      const j = (await r.json()) as { daily: { time: string[]; precipitation_sum: (number | null)[] } }
      const dias: DiaLluvia[] = j.daily.time.flatMap((fecha, i) => (j.daily.precipitation_sum[i] == null ? [] : [{ fecha, mm: j.daily.precipitation_sum[i]! }]))
      return lluviaDelMes(dias, ymd(new Date()))
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

