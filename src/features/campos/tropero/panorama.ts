// Campos · lo que importa de cada potrero, con lo que ya se cargó: la última
// recorrida (pasto, agua, eléctrico, novedad), la lluvia y los días. Sólo
// hechos: nunca se recomienda ni se supone. Puro.

import type { Database } from '@/lib/supabase/types'
import type { Dias } from './dias'

type E = Database['public']['Enums']
export type Observacion = { potreroId: string; fecha: string; pasto: E['pasto_estado'] | null; agua: E['agua_estado'] | null; electrico: E['electrico_estado'] | null; novedad: string | null }
export type Lluvia = { fecha: string; mm: number }
export type Aviso = { potreroId: string | null; texto: string; tono: 'problema' | 'atencion' }

export const PASTO: Record<E['pasto_estado'], string> = { abundante: 'Abundante', normal: 'Normal', escaso: 'Escaso', pelado: 'Pelado' }
export const AGUA: Record<E['agua_estado'], string> = { llena: 'Llena', normal: 'Normal', baja: 'Baja', seca: 'Seca' }


/** La última observación de cada potrero (la recorrida más nueva). */
export function ultimaPorPotrero(obs: Observacion[]): Map<string, Observacion> {
  const r = new Map<string, Observacion>()
  for (const o of obs) if (!r.has(o.potreroId) || r.get(o.potreroId)!.fecha < o.fecha) r.set(o.potreroId, o)
  return r
}

/** Milímetros desde una fecha (incluida). */
export const lluviaDesde = (ll: Lluvia[], desde: string) => ll.filter((l) => l.fecha >= desde.slice(0, 10)).reduce((t, l) => t + l.mm, 0)

/** Lo que pide atención en el campo: lo que se vio mal en la última recorrida y lo que falta ubicar. */
export function avisosDelCampo(potreros: { id: string; nombre: string; dibujado: boolean }[], ultima: Map<string, Observacion>): Aviso[] {
  const r: Aviso[] = []
  for (const p of potreros) {
    const o = ultima.get(p.id)
    if (!o) continue
    // Todo lo de un potrero en un solo aviso.
    const mal = [
      o.electrico === 'cortado' && 'eléctrico cortado',
      (o.agua === 'seca' || o.agua === 'baja') && `agua ${o.agua}`,
      (o.pasto === 'pelado' || o.pasto === 'escaso') && `pasto ${o.pasto}`,
    ].filter(Boolean)
    if (!mal.length) continue
    const grave = o.electrico === 'cortado' || o.agua === 'seca' || o.pasto === 'pelado'
    r.push({ potreroId: p.id, texto: `${p.nombre}: ${mal.join(', ')}`, tono: grave ? 'problema' : 'atencion' })
  }
  const sin = potreros.filter((p) => !p.dibujado)
  if (sin.length) r.push({ potreroId: null, texto: sin.length === 1 ? `Falta dibujar el ${sin[0]!.nombre}` : `Faltan dibujar ${sin.length} potreros`, tono: 'atencion' })
  return r.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === 'problema' ? -1 : 1))
}

/** «10 días adentro» / «Descansa hace 12 días». */
export function textoDias(d: Dias): string | null {
  if (!d) return null
  if ('adentro' in d) return d.adentro === 1 ? '1 día adentro' : `${d.adentro} días adentro`
  return d.descansa === 1 ? 'Descansa hace 1 día' : `Descansa hace ${d.descansa} días`
}
