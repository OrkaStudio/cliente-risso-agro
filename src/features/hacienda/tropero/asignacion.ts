import type { Database } from '@/lib/supabase/types'
import { categoriaNombre } from '../labels'
import { soloDigitos, type Fila } from './planilla'

// A qué animal va cada número de la planilla. Puro y sin suponer nada: cada
// número va a un grupo exacto (potrero + categoría) que dijo la planilla o
// eligió el productor. Dentro de un grupo los animales son iguales en Tropero
// (ninguno tiene un dato propio), así que da lo mismo a cuál le toca cada
// número. Si el grupo no alcanza, no entra ninguno: lo resuelve el productor.

type Categoria = Database['public']['Enums']['categoria_animal']

/** Un animal del rodeo que todavía no tiene caravana. */
export type SinCaravana = {
  id: string
  categoria: Categoria
  potreroId: string | null
  createdAt: string
  /** Tiene un dato que lo distingue (nacimiento, raza, pelaje): su caravana va desde su ficha. */
  propio: boolean
}
export type PotreroRef = { id: string; nombre: string; campoId: string; campo: string }

export type Estado = 'lista' | 'error' | 'falta_que' | 'falta_donde' | 'no_entra'
export type Destino = { estado: Estado; motivo: string | null; animalId: string | null }
export type Grupo = {
  clave: string
  potreroId: string
  categoria: Categoria
  filas: Fila[]
  /** Los animales sin caravana del grupo (los que no tienen datos propios). */
  disponibles: number
  /** Los que tienen datos propios: no entran por planilla. */
  propios: number
  entra: boolean
}

export const claveGrupo = (potreroId: string, categoria: Categoria) => `${potreroId}|${categoria}`

/**
 * A cuáles de un potrero y categoría se les puede poner número sin elegir a
 * ciegas: si son todos iguales (ninguno tiene un dato propio), a cualquiera;
 * si hay uno solo, a ése. Si hay varios y alguno se distingue, sólo a los
 * iguales: los que tienen datos propios van desde su ficha.
 */
export function asignables(sin: SinCaravana[], potreroId: string, categoria: Categoria) {
  const todos = sin.filter((a) => a.potreroId === potreroId && a.categoria === categoria).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const libres = todos.length === 1 ? todos : todos.filter((a) => !a.propio)
  return { libres, propios: todos.length - libres.length }
}

/** «el 3A de La Porteña» */
export const nombrePotrero = (p: PotreroRef | undefined, repetido = true) => (p ? (repetido ? `${p.nombre}, ${p.campo}` : p.nombre) : 'ese potrero')

export function asignar(filas: Fila[], sin: SinCaravana[], errores: Map<string, string>, potreros: PotreroRef[]) {
  const porFila = new Map<string, Destino>()
  const pot = new Map(potreros.map((p) => [p.id, p]))
  const grupos = new Map<string, Grupo>()

  for (const f of filas) {
    const error = errores.get(f.clave)
    if (error) {
      porFila.set(f.clave, { estado: 'error', motivo: error, animalId: null })
      continue
    }
    if (!f.categoria) {
      porFila.set(f.clave, { estado: 'falta_que', motivo: f.categoriaTexto ? `No sabemos qué es «${f.categoriaTexto}»` : 'La planilla no dice qué es', animalId: null })
      continue
    }
    if (!f.potreroId) {
      const lugares = [...new Set(sin.flatMap((a) => (a.potreroId && a.categoria === f.categoria ? [a.potreroId] : [])))]
      if (!lugares.some((id) => asignables(sin, id, f.categoria!).libres.length > 0)) {
        porFila.set(f.clave, { estado: 'no_entra', motivo: `No hay ${categoriaNombre(f.categoria, 2).toLowerCase()} sin caravana en ningún campo: si entraron, sumalos con «Entraron»`, animalId: null })
        continue
      }
      const motivo = f.potreroCandidatos.length
        ? `Hay un «${f.potreroTexto}» en ${y(f.potreroCandidatos.map((id) => pot.get(id)?.campo ?? '?'))}: ¿en cuál?`
        : f.potreroTexto
          ? `No hay un potrero «${f.potreroTexto}»`
          : 'La planilla no dice dónde está'
      porFila.set(f.clave, { estado: 'falta_donde', motivo, animalId: null })
      continue
    }
    const clave = claveGrupo(f.potreroId, f.categoria)
    const g = grupos.get(clave) ?? { clave, potreroId: f.potreroId, categoria: f.categoria, filas: [], disponibles: 0, propios: 0, entra: true }
    g.filas.push(f)
    grupos.set(clave, g)
  }

  for (const g of grupos.values()) {
    const { libres, propios } = asignables(sin, g.potreroId, g.categoria)
    g.disponibles = libres.length
    g.propios = propios
    g.entra = g.filas.length <= libres.length
    const donde = `el ${nombrePotrero(pot.get(g.potreroId))}`
    const que = (n: number) => `${n} ${categoriaNombre(g.categoria, n).toLowerCase()}`
    const motivo = g.entra
      ? null
      : libres.length === 0
        ? `En ${donde} no hay ${categoriaNombre(g.categoria, 2).toLowerCase()} sin caravana${g.propios ? ` (${g.propios === 1 ? 'hay 1 con datos propios: va desde su ficha' : `hay ${g.propios} con datos propios: van desde su ficha`})` : ''}`
        : `La planilla trae ${que(g.filas.length)} para ${donde} y ahí hay ${libres.length} sin caravana`
    g.filas.forEach((f, i) => porFila.set(f.clave, g.entra ? { estado: 'lista', motivo: null, animalId: libres[i]!.id } : { estado: 'no_entra', motivo, animalId: null }))
  }

  return { porFila, grupos: [...grupos.values()] }
}

const y = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

/** «1041 a 1048, 1050» */
export function rangos(numeros: string[]): string {
  const ns = [...new Set(numeros.map(soloDigitos).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const out: string[] = []
  for (let i = 0; i < ns.length; ) {
    let j = i
    while (j + 1 < ns.length && Number(ns[j + 1]) === Number(ns[j]) + 1 && ns[j + 1]!.length === ns[i]!.length) j++
    out.push(j - i >= 2 ? `${ns[i]} a ${ns[j]}` : ns.slice(i, j + 1).join(', '))
    i = j + 1
  }
  return out.join(', ')
}

/** Las filas «del 1001 al 1030», por su caravana visible. Las que sólo tienen chip no entran: se marcan una por una. */
export function filasDelRango(filas: Fila[], desde: string, hasta: string): string[] {
  const a = Number(soloDigitos(desde))
  const b = Number(soloDigitos(hasta) || soloDigitos(desde))
  if (!Number.isFinite(a) || !Number.isFinite(b) || !soloDigitos(desde)) return []
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return filas.filter((f) => soloDigitos(f.visual) && Number(soloDigitos(f.visual)) >= lo && Number(soloDigitos(f.visual)) <= hi).map((f) => f.clave)
}
