import { useQuery } from '@tanstack/react-query'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { supabase } from '@/lib/supabase/client'
import { hoyEnArgentina } from '@/features/cotizaciones/api'
import { useTiempo } from '@/features/cotizaciones/hooks'
import { usePanoramaInicio } from '../hooks'
import { useParaAtender } from '../para-atender-api'
import { cosasParaHoy, delCampo, inicioDeCampania, lluviaDelMes } from './dia'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { puedeVer, veePlata } from '@/features/empresa/secciones'

/**
 * La lluvia del último mes (30 días que terminan ayer) en la ubicación del campo,
 * según Open-Meteo. Es la única fuente de la lluvia: el saludo, la tarjeta, el
 * clima y el Hoy dicen el mismo número. No se carga a mano (decisión del 10/10).
 * Sale de la misma consulta que el clima y el pronóstico.
 */
export const useLluviaDelMes = (ubicacion: { lat: number; lon: number } | null) =>
  useTiempo(ubicacion, (t) => lluviaDelMes(t.pasado, hoyEnArgentina()))

/** Lo que entró menos lo que salió desde el 1 de julio (la campaña), de un campo o de todos. */
export const useGanadoCampania = (campoId: string | null = null) =>
  useQuery({
    queryKey: ['inicio', 'ganado-campania', campoId],
    queryFn: async (): Promise<number> => {
      let q = supabase.from('v_flujo_caja').select('neto').gte('mes', inicioDeCampania(new Date()))
      if (campoId) q = q.eq('campo_id', campoId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []).reduce((s, f) => s + (f.neto ?? 0), 0)
    },
  })

/** Cuántas cosas hay para atender hoy: lo mismo que lista el Inicio (y el número de la barra). */
export function useCuantasHoy(): number {
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  // Lo mismo que muestra el Inicio: del campo elegido en la barra, o de todos.
  const campoId = useCampoElegido().elegido?.id ?? null
  // Mientras falta el mapa, el Inicio pide una sola cosa: terminarlo (lo demás es adelanto).
  const pendiente = useMapaPendiente()
  const { data: membresia } = useEmpresa()
  if (pendiente) return 1
  if (!panorama.data || !atender.data) return 0
  const v = delCampo(campoId, panorama.data, atender.data)
  const campos = puedeVer(membresia, 'campos')
  return cosasParaHoy(campos ? v.potreros : [], veePlata(membresia) ? v.vencimientos : [], campos ? v.sinRecorrer : []).length
}

