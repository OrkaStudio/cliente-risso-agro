import { categoriaNombre } from '@/features/hacienda/labels'
import type { CategoriaAnimal } from './api'

/**
 * Las salidas de la manga.
 *
 * **El nombre de una salida es lo que ES el animal, no dónde está la puerta.**
 * En un destete el productor toca (o lee) `Vaca` y `Ternero`; en un tacto,
 * `Preñada` y `Vacía`. Elegir entre "Izquierda" y "Derecha" con el rodeo
 * mezclado adentro del cepo obliga a una traducción mental —"el ternero era
 * izquierda o derecha"— justo en el peor momento, y ahí es donde se mezcla.
 *
 * El lado no desaparece: es lo único que se puede EJECUTAR, y sigue estando en
 * la pantalla. Pero baja a atributo del grupo y se refuerza con una flecha, un
 * color propio y la posición física del botón, para que se lea sin leerse.
 *
 * De ahí sale la inversión que ordena el trabajo: la app no pregunta qué es el
 * animal cuando puede saberlo. El bastón trae la caravana, la caravana trae la
 * categoría, y el plan prearmado dice el resto.
 */

/** Lo que el operario tiene delante en el cepo. Tres es el tope real. */
export type Lado = 'izq' | 'der' | 'frente'

export const LADOS: Lado[] = ['izq', 'der', 'frente']

export const ladoLabel: Record<Lado, string> = {
  izq: 'Izquierda',
  der: 'Derecha',
  frente: 'De frente',
}

/** Abreviatura para el cartel grande: se lee de reojo, a un brazo. */
export const ladoCorto: Record<Lado, string> = {
  izq: 'IZQ',
  der: 'DER',
  frente: 'FRENTE',
}

/**
 * La flecha es el refuerzo que hace innecesario leer la palabra. Apunta a donde
 * de verdad va el animal, así que en la pantalla el botón de la izquierda va a
 * la izquierda: forma, color y posición dicen lo mismo tres veces.
 */
export const ladoFlecha: Record<Lado, string> = {
  izq: '←',
  der: '→',
  frente: '↑',
}

/**
 * A dónde va el animal que sale por ese grupo. Son de naturalezas distintas y
 * no se pueden mezclar: mandarlo a venta no cambia dónde está parado, mandarlo
 * al 6B sí.
 */
export type Destino =
  /** Se mueve DE VERDAD: cambia el stock del potrero (RPC `mover_animales`). */
  | { k: 'potrero'; id: string; nombre: string }
  /** Apartado para vender. NO se da de baja: todavía está vivo y en el campo. */
  | { k: 'venta' }
  /** Queda encerrado, se resuelve después. No mueve stock: no hay potrero. */
  | { k: 'manga' }
  /** Vuelve de donde vino: la salida existe físicamente pero no mueve nada. */
  | { k: 'queda' }

export type DestinoKind = Destino['k']

export function destinoLabel(d: Destino): string {
  if (d.k === 'potrero') return `Potrero ${d.nombre}`
  if (d.k === 'venta') return 'Se venden'
  if (d.k === 'manga') return 'Quedan en la manga'
  return 'Vuelven al potrero'
}

/**
 * Versión corta para el cartel del trabajo y los botones del tacto, donde el
 * espacio es del héroe.
 *
 * Va en SINGULAR: ahí se habla del animal que está en el cepo en ese momento,
 * no del grupo. `destinoLabel` es la forma de grupo ("Vuelven al potrero") y se
 * usa en el prearmado y en el resumen, donde el sujeto sí es el conjunto.
 */
export function destinoCorto(d: Destino): string {
  if (d.k === 'potrero') return `al ${d.nombre}`
  if (d.k === 'venta') return 'a venta'
  if (d.k === 'manga') return 'queda en la manga'
  return 'vuelve al potrero'
}

/**
 * Un grupo del aparte: un conjunto de animales con NOMBRE PROPIO, que sale por
 * un lado del cepo hacia un destino.
 *
 * `etiqueta` es lo único que el productor lee en el momento del trabajo, y por
 * eso está en el vocabulario del animal ("Vaquillona", "Preñada", "Gordos") y
 * nunca en el de la puerta.
 */
export type Salida = {
  /** Estable dentro de la sesión: es la clave del mapeo y del conteo. */
  id: string
  etiqueta: string
  lado: Lado
  destino: Destino
}

/**
 * De dónde sale el grupo de cada animal. Es la única diferencia entre destetar,
 * apartar y tactar — el resto del mecanismo es idéntico.
 *
 *  · `categoria` → lo sabe el sistema por la caravana. Cero toques.
 *  · `libre`     → lo elige el operario y DURA hasta que mueva la puerta.
 *  · `resultado` → sale del toque que ya se hace igual (preñada / vacía).
 */
export type ModoSalida = 'categoria' | 'libre' | 'resultado'

export type PlanSalidas = {
  modo: ModoSalida
  salidas: Salida[]
  /** categoría → `salida.id`. Lo que no esté mapeado no se aparta: se queda. */
  porCategoria: Partial<Record<CategoriaAnimal, string>>
  /** Para `resultado`: qué respuesta del toque cae en qué grupo. */
  porResultado?: Record<string, string>
}

/** Las dos respuestas del tacto. Es la única clasificación por toque hoy. */
export const RESULTADOS_TACTO = [
  { clave: 'prenada', label: 'Preñada' },
  { clave: 'vacia', label: 'Vacía' },
] as const

/** Categorías que en un destete son MADRE (el resto de las presentes es cría). */
export const MADRES: CategoriaAnimal[] = ['vaca', 'vaquillona']
export const CRIAS: CategoriaAnimal[] = ['ternero', 'ternera']

/**
 * El nombre de un grupo armado por categorías, en el idioma del productor.
 *
 * Con una sola categoría es el singular —"Vaquillona"— porque el cartel habla
 * del animal que tenés adelante, no del conjunto. Con varias se listan: decir
 * "Madres" cuando adentro hay vacas Y vaquillonas obliga a recordar qué metimos
 * ahí, que es exactamente el trabajo mental que estamos sacando.
 */
export function etiquetaDeCategorias(cats: CategoriaAnimal[]): string {
  if (cats.length === 0) return 'Sin asignar'
  if (cats.length === 1) return categoriaNombre(cats[0], 1)
  return cats.map((c) => categoriaNombre(c, 2)).join(' y ')
}

/**
 * Plan por defecto de un destete: madres para un lado, crías para el otro.
 *
 * Es el único caso donde el sistema puede proponerlo solo, porque esa
 * separación no es una preferencia: **es** la definición del trabajo.
 */
export function planDestete(presentes: CategoriaAnimal[]): {
  salidas: Salida[]
  porCategoria: Partial<Record<CategoriaAnimal, string>>
} {
  const madres = presentes.filter((c) => MADRES.includes(c))
  const crias = presentes.filter((c) => CRIAS.includes(c))
  const salidas: Salida[] = []
  const porCategoria: Partial<Record<CategoriaAnimal, string>> = {}

  if (madres.length > 0) {
    salidas.push({
      id: 'madres',
      etiqueta: etiquetaDeCategorias(madres),
      lado: 'izq',
      destino: { k: 'queda' },
    })
    for (const c of madres) porCategoria[c] = 'madres'
  }
  if (crias.length > 0) {
    salidas.push({
      id: 'crias',
      etiqueta: etiquetaDeCategorias(crias),
      lado: 'der',
      destino: { k: 'queda' },
    })
    for (const c of crias) porCategoria[c] = 'crias'
  }
  return { salidas, porCategoria }
}

/**
 * Plan de un aparte POR CATEGORÍA: una salida por categoría presente, con su
 * nombre propio. Es el camino de cero toques — la caravana ya dice qué es.
 *
 * Se reparten por lado alternando: es un punto de partida razonable que el
 * productor corrige con un toque, no una decisión que la app se arrogue.
 */
export function planPorCategoria(presentes: CategoriaAnimal[]): {
  salidas: Salida[]
  porCategoria: Partial<Record<CategoriaAnimal, string>>
} {
  const salidas: Salida[] = []
  const porCategoria: Partial<Record<CategoriaAnimal, string>> = {}
  presentes.forEach((c, i) => {
    salidas.push({
      id: c,
      etiqueta: categoriaNombre(c, 1),
      lado: LADOS[Math.min(i, LADOS.length - 1)],
      destino: { k: 'queda' },
    })
    porCategoria[c] = c
  })
  return { salidas, porCategoria }
}

/** Plan de un tacto: los dos resultados son los grupos, y el toque los decide. */
export function planTacto(): {
  salidas: Salida[]
  porResultado: Record<string, string>
} {
  return {
    salidas: [
      {
        id: 'prenada',
        etiqueta: 'Preñada',
        lado: 'izq',
        destino: { k: 'queda' },
      },
      { id: 'vacia', etiqueta: 'Vacía', lado: 'der', destino: { k: 'queda' } },
    ],
    porResultado: { prenada: 'prenada', vacia: 'vacia' },
  }
}

export function salidaPorId(plan: PlanSalidas, id: string): Salida | null {
  return plan.salidas.find((s) => s.id === id) ?? null
}

/** El grupo que le toca a un animal, o null si esa categoría no se aparta. */
export function salidaDeCategoria(
  plan: PlanSalidas,
  categoria: CategoriaAnimal,
): Salida | null {
  const id = plan.porCategoria[categoria]
  return id ? salidaPorId(plan, id) : null
}

/** Cuántas categorías presentes quedaron sin grupo: se avisa antes de arrancar. */
export function sinAsignar(
  plan: PlanSalidas,
  presentes: CategoriaAnimal[],
): CategoriaAnimal[] {
  return presentes.filter((c) => !plan.porCategoria[c])
}

/**
 * El color de cada lado es IDENTIDAD: el mismo en el prearmado, en el cartel
 * grande y en el resumen del cierre. El operario aprende "verde = izquierda"
 * una vez y después lo lee sin leer.
 */
export const colorLado: Record<
  Lado,
  { borde: string; fondo: string; tinta: string }
> = {
  izq: {
    borde: 'var(--c-ok)',
    fondo: 'var(--c-ok-soft)',
    tinta: 'var(--c-ok-deep)',
  },
  der: {
    borde: 'var(--c-warn)',
    fondo: 'var(--c-warn-soft)',
    tinta: 'var(--c-warn-deep)',
  },
  frente: { borde: '#3b6bd4', fondo: '#e7eeff', tinta: '#26439a' },
}

/** Orden de lectura en pantalla: izquierda a la izquierda, derecha a la
 *  derecha. La posición del botón es el tercer refuerzo, después de la flecha
 *  y el color. */
export function ordenarPorLado<T extends { lado: Lado }>(xs: T[]): T[] {
  const peso: Record<Lado, number> = { izq: 0, frente: 1, der: 2 }
  return [...xs].sort((a, b) => peso[a.lado] - peso[b.lado])
}
