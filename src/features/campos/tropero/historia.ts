// Campos · «Lo que pasó en el 11B» (Figma 900:9563) y el descanso antes de
// que entrara la hacienda (Figma 900:9217, «Descansó 25 días»). Puro.

import type { Observacion } from './panorama'

export type MovimientoPotrero = { animalId: string; fecha: string; origen: string | null; destino: string | null; origenNombre: string | null; destinoNombre: string | null }
export type Labor = { potreroId: string; fecha: string; tipo: 'laboreo' | 'siembra' | 'fertilizacion' | 'fumigacion' | 'corte_forraje' | 'cosecha'; cultivo: string | null; nota: string | null; kg: number | null }
export type Hecho = { fecha: string; tipo: 'recorrida' | 'hacienda' | 'labor'; titulo: string; detalle: string | null }

export const LABOR: Record<Labor['tipo'], string> = { laboreo: 'Laboreo', siembra: 'Siembra', fertilizacion: 'Fertilización', fumigacion: 'Fumigación', corte_forraje: 'Corte de forraje', cosecha: 'Cosecha' }
const PASTO = { abundante: 'abundante', normal: 'normal', escaso: 'escaso', pelado: 'pelado' }
const AGUA = { llena: 'llena', normal: 'normal', baja: 'baja', seca: 'seca' }
const dias = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000))

/** Cuántos días descansó antes de la entrada (desde la última salida anterior). Sin salida antes: null. */
export function descansoPrevio(potreroId: string, entrada: string, movs: MovimientoPotrero[]): number | null {
  const salidas = movs.filter((m) => m.origen === potreroId && m.fecha < entrada).map((m) => m.fecha).sort()
  const ultima = salidas.at(-1)
  return ultima ? dias(ultima, entrada) : null
}

/** Lo que pasó en un potrero, de lo nuevo a lo viejo: recorridas, entradas y salidas de hacienda (agrupadas por día) y labores. */
export function historiaDelPotrero(potreroId: string, obs: Observacion[], movs: MovimientoPotrero[], labores: Labor[]): Hecho[] {
  const r: Hecho[] = []
  for (const o of obs.filter((x) => x.potreroId === potreroId)) {
    const partes = [o.pasto && `pasto ${PASTO[o.pasto]}`, o.agua && `agua ${AGUA[o.agua]}`, o.electrico === 'cortado' && 'eléctrico cortado'].filter(Boolean) as string[]
    r.push({ fecha: o.fecha, tipo: 'recorrida', titulo: 'Recorrida', detalle: [partes.join(', '), o.novedad && `«${o.novedad}»`].filter(Boolean).join('. ') || null })
  }
  const grupos = new Map<string, { n: number; otro: string | null; entra: boolean }>()
  for (const m of movs) {
    const entra = m.destino === potreroId
    if (!entra && m.origen !== potreroId) continue
    const k = `${m.fecha}|${entra ? 'e' : 's'}|${entra ? m.origenNombre : m.destinoNombre}`
    const g = grupos.get(k) ?? { n: 0, otro: entra ? m.origenNombre : m.destinoNombre, entra }
    g.n++
    grupos.set(k, g)
  }
  for (const [k, g] of grupos) {
    const una = g.n === 1
    r.push({
      fecha: k.split('|')[0]!,
      tipo: 'hacienda',
      titulo: g.entra ? (una ? 'Entró 1 animal' : `Entraron ${g.n} animales`) : una ? 'Salió 1 animal' : `Salieron ${g.n} animales`,
      detalle: g.otro ? (g.entra ? `Desde el ${g.otro}` : `Al ${g.otro}`) : null,
    })
  }
  for (const l of labores.filter((x) => x.potreroId === potreroId)) {
    r.push({ fecha: l.fecha, tipo: 'labor', titulo: LABOR[l.tipo], detalle: [l.cultivo, l.kg != null && `${l.kg.toLocaleString('es-AR')} kg`, l.nota].filter(Boolean).join(' · ') || null })
  }
  return r.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
