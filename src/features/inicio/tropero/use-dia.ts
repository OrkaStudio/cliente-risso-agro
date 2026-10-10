import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { hoyEnArgentina } from '@/features/cotizaciones/api'
import { useTiempo } from '@/features/cotizaciones/hooks'
import { usePanoramaInicio } from '../hooks'
import { useParaAtender } from '../para-atender-api'
import { cosasParaHoy, inicioDeCampania, lluviaDelMes } from './dia'

/**
 * La lluvia del último mes (30 días que terminan ayer) en la ubicación del campo,
 * según Open-Meteo. Es la única fuente de la lluvia: el saludo, la tarjeta, el
 * clima y el Hoy dicen el mismo número. No se carga a mano (decisión del 10/10).
 * Sale de la misma consulta que el clima y el pronóstico.
 */
export const useLluviaDelMes = (ubicacion: { lat: number; lon: number } | null) =>
  useTiempo(ubicacion, (t) => lluviaDelMes(t.pasado, hoyEnArgentina()))

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

