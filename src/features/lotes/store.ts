// Store en memoria de LOTES (Fase 0, sin backend). Reactivo vía
// useSyncExternalStore para que el estado sobreviva a la navegación entre
// /lotes y /lotes/:id. Se reemplaza por hooks de React Query contra Supabase
// cuando se construya el modelo de datos. Los animales se modelan
// INDIVIDUALES por caravana (spec lote-hacienda-multiespecie-existencias).
import { useSyncExternalStore } from 'react'
import {
  categoriasPorEspecie,
  type Especie,
  type PropositoLote,
  type Sexo,
} from '@/features/lotes/domain'
import {
  campos as camposSeed,
  lotes as lotesSeed,
  type Campo,
} from '@/features/lotes/mock'

export type Animal = {
  id: string
  caravana: string
  sexo: Sexo
  categoria: string
}

export type Lote = {
  id: string
  nombre: string
  campoId: string
  especie: Especie
  proposito: PropositoLote
  potreros: string[]
  animales: Animal[]
}

const sexoDeCategoria: Record<string, Sexo> = Object.fromEntries(
  Object.values(categoriasPorEspecie)
    .flat()
    .map((c) => [c.id, c.sexo ?? 'hembra']),
)
export function sexoPorCategoria(cat: string): Sexo {
  return sexoDeCategoria[cat] ?? 'hembra'
}

let uid = 0
const nextId = () => `x${++uid}`

/** Lotes del Excel SIN stock: arrancan vacíos para que el productor cargue la
 *  hacienda a mano (animal por animal, con su caravana) y pruebe la plataforma.
 *  Se mantiene la estructura de lotes (campo, código, propósito, potreros). */
function seed(): Lote[] {
  return lotesSeed.map((l) => ({
    id: l.id,
    nombre: l.nombre,
    campoId: l.campoId,
    especie: l.especie,
    proposito: l.proposito,
    potreros: [...l.potreros],
    animales: [] as Animal[],
  }))
}

let state: Lote[] = seed()
const listeners = new Set<() => void>()
function emit() {
  state = [...state]
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function getSnapshot() {
  return state
}

export function useLotes(): Lote[] {
  return useSyncExternalStore(subscribe, getSnapshot)
}
export function useLote(id: string): Lote | undefined {
  return useLotes().find((l) => l.id === id)
}

export const campos = camposSeed
export function campoDe(id: string): Campo | undefined {
  return camposSeed.find((c) => c.id === id)
}

export function totalLote(l: Lote): number {
  return l.animales.length
}

/** Código identificatorio del lote: número + letra del color del campo.
 *  Ej: campo Amarillo (letra A) → "1A", "2A". Diferencia el lote por campo. */
export function codigoLote(l: Lote): string {
  const letra = campoDe(l.campoId)?.color.letra ?? ''
  const num = l.nombre.match(/\d+/)?.[0] ?? l.nombre
  return `${num}${letra}`
}

/** Número “crudo” del lote (sin la letra del campo). */
export function numeroLote(l: Lote): string {
  return l.nombre.match(/\d+/)?.[0] ?? l.nombre
}

/** Composición por categoría derivada de los animales, en el orden de la especie. */
export function composicionDe(
  l: Lote,
): { categoria: string; cantidad: number }[] {
  const map = new Map<string, number>()
  for (const a of l.animales) map.set(a.categoria, (map.get(a.categoria) ?? 0) + 1)
  const orden = categoriasPorEspecie[l.especie].map((c) => c.id)
  return [...map.entries()]
    .map(([categoria, cantidad]) => ({ categoria, cantidad }))
    .sort((a, b) => orden.indexOf(a.categoria) - orden.indexOf(b.categoria))
}

// ---- acciones ----
export function crearLote(input: {
  nombre: string
  campoId: string
  especie: Especie
  proposito: PropositoLote
  potreros: string[]
}): string {
  const id = `l${++uid}`
  state.push({ ...input, id, animales: [] })
  emit()
  return id
}

export function actualizarLote(
  id: string,
  patch: Partial<Pick<Lote, 'nombre' | 'campoId' | 'proposito' | 'potreros'>>,
) {
  const lote = state.find((l) => l.id === id)
  if (!lote) return
  Object.assign(lote, patch)
  emit()
}

export function borrarLote(id: string) {
  state = state.filter((l) => l.id !== id)
  emit()
}

/** Próximo número de lote disponible dentro de un campo. */
export function siguienteNumeroLote(campoId: string): number {
  const nums = state
    .filter((l) => l.campoId === campoId)
    .map((l) => parseInt(numeroLote(l), 10) || 0)
  return (nums.length ? Math.max(...nums) : 0) + 1
}

/** Parte un lote: saca los animales indicados y los pone en un lote NUEVO
 *  (mismo campo/especie) ubicado en el/los potrero(s) destino. Devuelve el id
 *  del nuevo lote, o null si no se movió nada. */
export function partirLote(
  id: string,
  opts: {
    animalIds: string[]
    potrerosDestino: string[]
    numero?: string
    proposito?: PropositoLote
  },
): string | null {
  const origen = state.find((l) => l.id === id)
  if (!origen) return null
  const set = new Set(opts.animalIds)
  const movidos = origen.animales.filter((a) => set.has(a.id))
  if (movidos.length === 0) return null
  origen.animales = origen.animales.filter((a) => !set.has(a.id))
  const numero = opts.numero?.trim() || String(siguienteNumeroLote(origen.campoId))
  const nuevoId = `l${++uid}`
  state.push({
    id: nuevoId,
    nombre: `Lote ${numero}`,
    campoId: origen.campoId,
    especie: origen.especie,
    proposito: opts.proposito ?? origen.proposito,
    potreros: opts.potrerosDestino,
    animales: movidos,
  })
  emit()
  return nuevoId
}

export function agregarAnimal(
  loteId: string,
  a: { caravana: string; categoria: string },
) {
  const lote = state.find((l) => l.id === loteId)
  if (!lote) return
  lote.animales = [
    {
      id: nextId(),
      caravana: a.caravana,
      categoria: a.categoria,
      sexo: sexoPorCategoria(a.categoria),
    },
    ...lote.animales,
  ]
  emit()
}

/** Carga N animales de una categoría de golpe (para replicar los conteos del
 *  Excel). Genera caravanas provisorias automáticas (código del lote +
 *  secuencia) que se pueden editar después al individualizar en la manga. */
export function agregarAnimalesPorCantidad(
  loteId: string,
  { categoria, cantidad }: { categoria: string; cantidad: number },
) {
  const lote = state.find((l) => l.id === loteId)
  if (!lote || cantidad <= 0) return
  const codigo = codigoLote(lote)
  const base = lote.animales.length
  const sexo = sexoPorCategoria(categoria)
  const nuevos: Animal[] = []
  for (let i = 0; i < cantidad; i++) {
    nuevos.push({
      id: nextId(),
      caravana: `${codigo}-${String(base + i + 1).padStart(4, '0')}`,
      categoria,
      sexo,
    })
  }
  lote.animales = [...nuevos, ...lote.animales]
  emit()
}

export function quitarAnimal(loteId: string, animalId: string) {
  const lote = state.find((l) => l.id === loteId)
  if (!lote) return
  lote.animales = lote.animales.filter((x) => x.id !== animalId)
  emit()
}
