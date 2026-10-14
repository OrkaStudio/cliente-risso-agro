import type { Database } from '@/lib/supabase/types'
import { useAnimales, useEventosSenales, usePotreros } from '../hooks'
import { categoriaNombre } from '../labels'
import { resumirEventos } from '../senales'
import { edadTexto } from './rodeo'
import type { Conocida } from './caravanas'

type Animal = Database['public']['Views']['v_animal_con_caravana']['Row']

/**
 * Las caravanas para ELEGIR de una lista (no para recordar): cada una con lo
 * que la hace reconocible — qué es, la edad, el último peso o tacto y dónde
 * está. «La vaca vieja de 6 años» se reconoce; el número, no se recuerda.
 */
export function usePosibles(cuales: (a: Animal) => boolean): (Conocida & { categoria: NonNullable<Animal['categoria']> })[] {
  const animales = useAnimales()
  const eventos = useEventosSenales()
  const potreros = usePotreros()
  const resumen = resumirEventos(eventos.data ?? [])
  const pot = new Map((potreros.data ?? []).map((p) => [p.id, p.nombre]))
  return (animales.data ?? [])
    .filter((a) => a.id && a.categoria && (a.caravana_visual || a.caravana_rfid) && cuales(a))
    .map((a) => {
      const r = resumen.get(a.id!)
      const dato = r?.ultimoPeso ? `${r.ultimoPeso.kg} kg` : r?.ultimoTacto ? (r.ultimoTacto.resultado === 'prenada' ? 'preñada' : 'vacía') : null
      return {
        caravana: (a.caravana_visual ?? a.caravana_rfid)!,
        visual: a.caravana_visual,
        rfid: a.caravana_rfid,
        etiqueta: categoriaNombre(a.categoria!, 1),
        detalle: [edadTexto(a.fecha_nacimiento), dato, a.potrero_id ? pot.get(a.potrero_id) : null].filter(Boolean).join(' · '),
        categoria: a.categoria!,
      }
    })
    .sort((x, y) => (x.visual ?? x.rfid ?? '').localeCompare(y.visual ?? y.rfid ?? '', 'es', { numeric: true }))
}
