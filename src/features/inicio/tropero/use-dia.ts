import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { usePanoramaInicio } from '../hooks'
import { useParaAtender } from '../para-atender-api'
import { cosasParaHoy, inicioDeCampania, lluviaDe60Dias, type DiaLluvia, type Lluvia60 } from './dia'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * La lluvia de 60 días de un campo: las lecturas del pluviómetro (recorrida o
 * WhatsApp, `fuente = manual`) y, para los días sin lectura, el pronóstico de
 * Open-Meteo. La cuenta está en `lluviaDe60Dias`. Es la única fuente de la
 * lluvia en el Inicio y en el Hoy: todos dicen el mismo número.
 */
export function useLluvia60(campoId: string | null, ubicacion: { lat: number; lon: number } | null) {
  const medido = useQuery({
    queryKey: ['inicio', 'lluvia60', campoId],
    enabled: !!campoId,
    queryFn: async (): Promise<DiaLluvia[]> => {
      const desde = new Date()
      desde.setDate(desde.getDate() - 60)
      const { data, error } = await supabase
        .from('lluvia')
        .select('fecha, mm')
        .eq('campo_id', campoId!)
        .eq('fuente', 'manual')
        .gte('fecha', ymd(desde))
      if (error) throw new Error(error.message)
      return (data ?? []).map((x) => ({ fecha: x.fecha, mm: Number(x.mm) }))
    },
  })
  const estimado = useQuery({
    queryKey: ['inicio', 'lluvia-pronostico', ubicacion?.lat, ubicacion?.lon],
    enabled: !!ubicacion,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    queryFn: async (): Promise<DiaLluvia[]> => {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${ubicacion!.lat}&longitude=${ubicacion!.lon}&daily=precipitation_sum&past_days=60&forecast_days=1&timezone=America/Argentina/Buenos_Aires`,
      )
      if (!r.ok) throw new Error(`open-meteo ${r.status}`)
      const j = (await r.json()) as { daily: { time: string[]; precipitation_sum: (number | null)[] } }
      return j.daily.time.flatMap((fecha, i) => (j.daily.precipitation_sum[i] == null ? [] : [{ fecha, mm: j.daily.precipitation_sum[i]! }]))
    },
  })
  // Mientras falte cualquiera de las dos, no se muestra un número a medias.
  const listo = medido.isSuccess && (estimado.isSuccess || estimado.isError || !ubicacion)
  const data: Lluvia60 | undefined = listo
    ? lluviaDe60Dias(estimado.isSuccess ? estimado.data : null, medido.data, ymd(new Date()))
    : undefined
  return { data }
}

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

