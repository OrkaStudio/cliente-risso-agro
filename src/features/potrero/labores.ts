import {
  Combine,
  Scissors,
  Sprout,
  SprayCan,
  Tractor,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'

export type TipoLabor = Database['public']['Enums']['tipo_labor']

/**
 * Las seis labores de un potrero agrícola.
 *
 * Todas tienen la MISMA forma —qué, cuándo, una nota y cuánto costó— y sólo dos
 * preguntan algo más: la siembra qué se sembró (es lo que se lee sobre el
 * potrero en el mapa) y la cosecha cuántos kilos salieron. Todo lo demás
 * —variedad, producto, dosis, si el corte fue rollo o silo— entra en la nota
 * hasta que alguien necesite filtrar o sumar por eso.
 *
 * `categoria` es el nombre de la categoría GLOBAL de Plata a la que se imputa el
 * gasto. Se resuelve por nombre y no por id porque son globales (`empresa_id`
 * null) y las comparte todo el mundo: hardcodear un uuid ataría el código a esta
 * base.
 */
export type Labor = {
  tipo: TipoLabor
  label: string
  Icon: LucideIcon
  /** Qué se le pregunta al productor abajo del tipo, si algo. */
  ayuda: string
  categoria: string
  pideCultivo?: boolean
  pideKg?: boolean
  /** Mueve el ciclo del potrero. Fumigar o fertilizar no cambia la etapa. */
  mueveCiclo?: boolean
}

export const LABORES: Labor[] = [
  {
    tipo: 'laboreo',
    label: 'Laboreo',
    Icon: Tractor,
    ayuda: 'Preparar la tierra antes de sembrar',
    categoria: 'Maquinaria / labores',
    mueveCiclo: true,
  },
  {
    tipo: 'siembra',
    label: 'Siembra',
    Icon: Sprout,
    ayuda: 'Qué se sembró queda escrito sobre el potrero',
    categoria: 'Semillas',
    pideCultivo: true,
    mueveCiclo: true,
  },
  {
    tipo: 'fertilizacion',
    label: 'Fertilización',
    Icon: Wheat,
    ayuda: 'Urea, fosfato, lo que sea',
    categoria: 'Fertilizantes / agroquímicos',
  },
  {
    tipo: 'fumigacion',
    label: 'Fumigación',
    Icon: SprayCan,
    ayuda: 'Herbicida, insecticida, fungicida',
    categoria: 'Fertilizantes / agroquímicos',
  },
  {
    tipo: 'corte_forraje',
    label: 'Corte de forraje',
    Icon: Scissors,
    ayuda: 'Rollo, silo o fardo — anotá cuál en la nota',
    categoria: 'Maquinaria / labores',
  },
  {
    tipo: 'cosecha',
    label: 'Cosecha',
    Icon: Combine,
    ayuda: 'Cierra la campaña del potrero',
    categoria: 'Maquinaria / labores',
    pideKg: true,
  },
]

export const laborPorTipo = new Map(LABORES.map((l) => [l.tipo, l]))

/**
 * Rinde en kg/ha. Devuelve null cuando el potrero todavía no tiene superficie
 * cargada: **nunca se inventa un rinde sobre una superficie que no está**. Los
 * kilos quedan guardados igual y el rinde aparece el día que se carguen las ha.
 */
export function rinde(kg: number | null, hectareas: number | null): number | null {
  if (kg == null || hectareas == null || hectareas <= 0) return null
  return Math.round(kg / hectareas)
}
