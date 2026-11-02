// Mapa del campo (spec «Tropero para código», sección 3): las reglas, sin
// React ni red. Se prueban solas en reglas.test.ts.
import area from '@turf/area'
import intersect from '@turf/intersect'
import union from '@turf/union'
import { featureCollection, polygon as turfPolygon } from '@turf/helpers'

/** [lat, lng], como se guarda en la base (jsonb). */
export type LatLng = [number, number]

export type PotreroMapa = {
  id: string
  nombre: string
  /** Lo que se cargó en el onboarding. */
  hectareas: number | null
  poligono: LatLng[] | null
  cabezas: number
  /** «60 cabezas», «Trigo», «En descanso»: lo que ayuda a reconocerlo. */
  que: string
  /** Lo que tiene, para el color en el mapa (el mismo que el ejemplo). */
  tipo?: 'hacienda' | 'sembrado' | 'descanso' | 'vacio'
}

export type CampoMapa = {
  id: string
  nombre: string
  provincia: string
  /** Su color en la app (el mismo índice de siempre). */
  colorIdx?: number | null
  /** El pueblo que se puso en el alta: «Chascomús». */
  localidad?: string | null
  lat: number | null
  lon: number | null
  hectareas: number | null
  contorno: LatLng[] | null
  potreros: PotreroMapa[]
}

// ===== Geometría =====

function anillo(p: LatLng[]): number[][] {
  const r = p.map(([lat, lng]) => [lng, lat])
  const [a, b] = [r[0]!, r[r.length - 1]!]
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([...a])
  return r
}

/** Hectáreas de un dibujo. */
export function hectareasDe(p: LatLng[]): number {
  if (p.length < 3) return 0
  return area(turfPolygon([anillo(p)])) / 10_000
}

/** «unas 312 ha»: redondeado como lo diría alguien. */
export function haRedondo(n: number): number {
  return n >= 20 ? Math.round(n) : Math.round(n * 10) / 10
}

/** Como se lee: «8,5», «1.015». */
export const haTexto = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Hectáreas que dos dibujos comparten. */
function compartidas(a: LatLng[], b: LatLng[]): number {
  try {
    const i = intersect(featureCollection([turfPolygon([anillo(a)]), turfPolygon([anillo(b)])]))
    return i ? area(i) / 10_000 : 0
  } catch {
    return 0
  }
}

/** Se pisa con otro potrero ya dibujado (más del 10 % del más chico). */
export function pisaA(dibujo: LatLng[], otros: PotreroMapa[]): PotreroMapa | null {
  const ha = hectareasDe(dibujo)
  for (const o of otros) {
    if (!o.poligono) continue
    const c = compartidas(dibujo, o.poligono)
    if (c > Math.min(ha, hectareasDe(o.poligono)) * 0.1) return o
  }
  return null
}

/** Parte del dibujo que queda afuera del borde del campo (0 a 1). */
export function fueraDelBorde(dibujo: LatLng[], contorno: LatLng[]): number {
  const ha = hectareasDe(dibujo)
  if (ha === 0) return 0
  return Math.max(0, 1 - compartidas(dibujo, contorno) / ha)
}

/** La esquina de más arriba a la izquierda del borde: ahí señala la mano. */
export function esquinaDe(p: LatLng[]): LatLng {
  return p.reduce((a, b) => (b[0] - b[1] > a[0] - a[1] ? b : a))
}

// ===== Qué potrero es (Tutorial · Qué potrero es / Cuál es) =====

export type Candidato = PotreroMapa & { parecido: boolean }

/**
 * Los potreros que faltan dibujar, del tamaño más parecido al dibujo al menos.
 * «Tamaño parecido»: hasta un 15 % de diferencia (los bordes dibujados a mano
 * nunca dan exacto).
 */
export function candidatos(faltan: PotreroMapa[], haDibujo: number): Candidato[] {
  return faltan
    .map((p) => {
      const ha = p.hectareas ?? 0
      return { ...p, parecido: ha > 0 && Math.abs(ha - haDibujo) <= Math.max(ha, haDibujo) * 0.15 }
    })
    .sort((a, b) => Math.abs((a.hectareas ?? 0) - haDibujo) - Math.abs((b.hectareas ?? 0) - haDibujo))
}

/**
 * Va elegido de entrada: el único que falta, o el único de tamaño parecido.
 * Si hay dos o más parecidos (o ninguno), que elija el productor.
 */
export function preseleccion(cs: Candidato[]): string | null {
  if (cs.length === 1) return cs[0]!.id
  const parecidos = cs.filter((c) => c.parecido)
  return parecidos.length === 1 ? parecidos[0]!.id : null
}

// ===== Dónde está cada campo =====

export type EstadoCampo =
  | { tipo: 'sin-borde' }
  | { tipo: 'sin-potreros' }
  | { tipo: 'faltan'; faltan: PotreroMapa[] }
  | { tipo: 'listo' }

/**
 * Un potrero cuenta como dibujado si tiene su dibujo y cae dentro del borde del
 * campo (con más de la mitad afuera, quedó en otro lado: hay que redibujarlo).
 * Sin borde todavía, alcanza con tener el dibujo.
 */
export function dibujadoEn(p: PotreroMapa, contorno: LatLng[] | null): boolean {
  if (!p.poligono || p.poligono.length < 3) return false
  return !contorno || fueraDelBorde(p.poligono, contorno) <= 0.5
}

/** Primero el borde, después cada potrero dibujado adentro (Lau, 30/10). */
export function estadoDe(c: CampoMapa): EstadoCampo {
  if (!c.contorno) return { tipo: 'sin-borde' }
  if (c.potreros.length === 0) return { tipo: 'sin-potreros' }
  const faltan = c.potreros.filter((p) => !dibujadoEn(p, c.contorno))
  return faltan.length ? { tipo: 'faltan', faltan } : { tipo: 'listo' }
}

/**
 * El borde de un campo que no lo tiene pero sí todos sus potreros dibujados:
 * el contorno exterior de la unión de los potreros (el caso de Daniel: La
 * Porteña y Los Pampas). null si falta dibujar alguno o no se pueden unir.
 */
export function bordeDesdePotreros(potreros: PotreroMapa[]): LatLng[] | null {
  if (potreros.length === 0 || potreros.some((p) => !p.poligono || p.poligono.length < 3)) return null
  try {
    const todos = potreros.map((p) => turfPolygon([anillo(p.poligono!)]))
    const u = todos.length === 1 ? todos[0]! : union(featureCollection(todos))
    if (!u) return null
    const g = u.geometry
    // Si quedaron separados (potreros sueltos), el más grande; adentro, sólo el anillo de afuera.
    const anillos = g.type === 'Polygon' ? [g.coordinates[0]!] : g.coordinates.map((pol) => pol[0]!)
    const mayor = anillos.reduce((a, b) => (area(turfPolygon([b])) > area(turfPolygon([a])) ? b : a))
    return mayor.slice(0, -1).map(([lng, lat]) => [lat!, lng!] as LatLng)
  } catch {
    return null
  }
}

/** El campo por el que sigue: el primero que no está listo (null = todos listos). */
export function campoPendiente(cs: CampoMapa[]): CampoMapa | null {
  return cs.find((c) => estadoDe(c).tipo !== 'listo') ?? null
}

/** Nadie ubicó nada todavía: se muestra la bienvenida con el ejemplo. */
export function nadaUbicado(cs: CampoMapa[]): boolean {
  return cs.every((c) => !c.contorno)
}

/** Totales del mapa: hectáreas medidas (del borde), potreros y cabezas. */
export function totalesDelMapa(cs: CampoMapa[]): { hectareas: number; potreros: number; cabezas: number } {
  return {
    hectareas: Math.round(cs.reduce((s, c) => s + (c.contorno ? hectareasDe(c.contorno) : 0), 0)),
    potreros: cs.reduce((s, c) => s + c.potreros.length, 0),
    cabezas: cs.reduce((s, c) => s + c.potreros.reduce((t, p) => t + p.cabezas, 0), 0),
  }
}

/**
 * Lo dibujado es el doble o más (o la mitad o menos) de lo cargado en el alta:
 * lo más probable es que el dibujo no siga el alambrado. Ahí lo primero es
 * ajustar el dibujo, no pisar el alta (Lau, 30/10: «lo corrijo» rompía datos).
 */
export function lejosDelAlta(medido: number, alta: number | null): boolean {
  if (alta === null || alta <= 0 || medido <= 0) return false
  const r = medido / alta
  return r >= 2 || r <= 0.5
}

/** «unas 6 veces», «la mitad»: cuánto se aleja, dicho como se diría. */
export function cuantoSeAleja(medido: number, alta: number): string {
  const r = medido / alta
  return r >= 2 ? `unas ${Math.round(r)} veces lo que cargaste` : r <= 0.5 ? `menos de la mitad de lo que cargaste` : ''
}

/** Lo medido en el borde contra lo cargado en el alta (Tutorial · Borde marcado). */
export function compararBorde(medido: number, alta: number | null): 'sin-alta' | 'coincide' | 'adentro' | 'afuera' | 'muy-distinto' {
  if (alta === null || alta <= 0) return 'sin-alta'
  const d = (medido - alta) / alta
  if (Math.abs(d) <= 0.05) return 'coincide'
  if (Math.abs(d) > 0.25) return 'muy-distinto'
  return d < 0 ? 'adentro' : 'afuera'
}
