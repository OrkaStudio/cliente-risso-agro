import type { Database } from '@/lib/supabase/types'
import { categoriaNombre, categoriasPorEspecie } from '../labels'

// Entraron y Salieron (página 35): la hacienda que entra o sale por cantidad,
// sin leer caravanas. Puro: lo que hay en cada potrero, lo que se puede sacar
// y cómo se dice cada paso.

type Categoria = Database['public']['Enums']['categoria_animal']

export type Salida = 'venta' | 'muerte' | 'otroCampo' | 'correccion'
export type Entrada = 'compra' | 'nacimiento' | 'deOtroCampo' | 'correccion'
export type Que = { modo: 'salieron'; que: Salida } | { modo: 'entraron'; que: Entrada }

export const OPCIONES_SALIDA: { que: Salida; titulo: string; bajada: string }[] = [
  { que: 'venta', titulo: 'Los vendí', bajada: 'En el camión, hoy o antes' },
  { que: 'muerte', titulo: 'Murieron', bajada: 'Cuentan para la mortandad' },
  { que: 'otroCampo', titulo: 'Los llevé a otro campo', bajada: 'Pasan a otro de tus campos' },
  { que: 'correccion', titulo: 'Corregir cabezas', bajada: 'Había cargados de más: no es venta ni muerte' },
]
export const OPCIONES_ENTRADA: { que: Entrada; titulo: string; bajada: string }[] = [
  { que: 'compra', titulo: 'Los compré', bajada: 'La liquidación se suma después, desde Plata' },
  { que: 'nacimiento', titulo: 'Nacieron', bajada: 'Sin caravana todavía' },
  { que: 'deOtroCampo', titulo: 'Vinieron de otro campo mío', bajada: 'Pasan de un campo tuyo a otro' },
  { que: 'correccion', titulo: 'Corregir cabezas', bajada: 'Había más de los que figuraban' },
]

export type Hay = { total: number; sinCaravana: number }
/** Lo que hay en cada potrero, por categoría: cuántos y cuántos sin caravana. */
export function composicionPorPotrero(
  animales: { potrero_id: string | null; categoria: Categoria | null; estado: string | null; caravana_rfid: string | null }[],
): Map<string, Map<Categoria, Hay>> {
  const m = new Map<string, Map<Categoria, Hay>>()
  for (const a of animales) {
    if (a.estado !== 'activo' || !a.potrero_id || !a.categoria) continue
    const p = m.get(a.potrero_id) ?? new Map<Categoria, Hay>()
    const h = p.get(a.categoria) ?? { total: 0, sinCaravana: 0 }
    h.total += 1
    if (!a.caravana_rfid) h.sinCaravana += 1
    p.set(a.categoria, h)
    m.set(a.potrero_id, p)
  }
  return m
}

/** Las categorías para contar: en una salida, las que hay en el potrero; en una entrada, las del rodeo. */
export function categoriasParaContar(q: Que, enPotrero: Map<Categoria, Hay> | undefined): { categoria: Categoria; max: number | null; hay: number }[] {
  if (q.modo === 'salieron' || q.que === 'deOtroCampo') {
    return [...(enPotrero ?? new Map<Categoria, Hay>())]
      .map(([categoria, h]) => ({ categoria, hay: h.total, max: q.modo === 'salieron' && q.que === 'correccion' ? h.sinCaravana : h.total }))
      .filter((c) => c.hay > 0)
      .sort((a, b) => b.hay - a.hay)
  }
  const cats: Categoria[] = q.que === 'nacimiento' ? ['ternero', 'ternera'] : categoriasPorEspecie.bovino
  return cats.map((categoria) => ({ categoria, hay: enPotrero?.get(categoria)?.total ?? 0, max: null }))
}

/** De los que salen, cuántos tienen caravana y quedan para identificar (se eligen primero los sin caravana). */
export function pendientesDeIdentificar(items: { categoria: Categoria; cantidad: number }[], enPotrero: Map<Categoria, Hay> | undefined): number {
  return items.reduce((s, it) => s + Math.max(0, it.cantidad - (enPotrero?.get(it.categoria)?.sinCaravana ?? 0)), 0)
}

/** «12 terneros y 2 vacas» */
export function cuantosTexto(items: { categoria: Categoria; cantidad: number }[]): string {
  const xs = items.filter((it) => it.cantidad > 0).map((it) => `${it.cantidad} ${categoriaNombre(it.categoria, it.cantidad).toLowerCase()}`)
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`
}

/** El botón de confirmar: verbo + cuántos. */
export function botonConfirmar(q: Que, items: { categoria: Categoria; cantidad: number }[], destino?: string): string {
  const c = cuantosTexto(items)
  if (q.modo === 'salieron') {
    if (q.que === 'venta') return `Vender ${c}`
    if (q.que === 'muerte') return `Anotar que murieron ${c}`
    if (q.que === 'otroCampo') return destino ? `Llevar ${c} al ${destino}` : `Llevar ${c}`
    return `Sacar ${c} cargados de más`
  }
  if (q.que === 'deOtroCampo') return destino ? `Traer ${c} al ${destino}` : `Traer ${c}`
  return `Sumar ${c}`
}

/** El título del «Listo». */
export function tituloListo(q: Que, items: { categoria: Categoria; cantidad: number }[]): string {
  const c = cuantosTexto(items)
  const n = items.reduce((s, it) => s + it.cantidad, 0)
  if (q.modo === 'salieron') {
    if (q.que === 'venta') return `${n === 1 ? 'Se vendió' : 'Se vendieron'} ${c}`
    if (q.que === 'muerte') return `Anotamos que ${n === 1 ? 'murió' : 'murieron'} ${c}`
    if (q.que === 'otroCampo') return `${n === 1 ? 'Pasó' : 'Pasaron'} ${c} a otro campo`
    return `Sacamos ${c} cargados de más`
  }
  if (q.que === 'nacimiento') return `Sumamos ${c} ${n === 1 ? 'nacido' : 'nacidos'}`
  if (q.que === 'deOtroCampo') return `${n === 1 ? 'Llegó' : 'Llegaron'} ${c}`
  return `Sumamos ${c}`
}
