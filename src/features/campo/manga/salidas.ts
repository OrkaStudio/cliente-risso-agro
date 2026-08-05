import type { CategoriaAnimal } from './api'

/**
 * Las salidas de la manga, tal como se trabaja de verdad.
 *
 * En el cepo NO pasa primero toda una categoría y después la otra: viene todo
 * mezclado y se aparta de a uno, marcando **derecha o izquierda**. Por eso las
 * salidas no son destinos abstractos sino POSICIONES FÍSICAS: es lo que el
 * operario tiene delante y lo único que puede ejecutar en el momento.
 *
 * De ahí sale la inversión que ordena todo el trabajo: la app no pregunta a
 * dónde va el animal — **se lo dice**. El bastón trae la caravana, la caravana
 * trae la categoría, y el mapeo prearmado dice el lado. El operario abre esa
 * puerta y sigue. Cero toques con el rodeo entero mezclado.
 */

/** Lo que el operario ve desde el cepo. Tres es el tope real de una manga. */
export type Lado = 'izq' | 'der' | 'frente'

export const LADOS: Lado[] = ['izq', 'der', 'frente']

export const ladoLabel: Record<Lado, string> = {
  izq: 'Izquierda',
  der: 'Derecha',
  frente: 'De frente',
}

/** Abreviatura para el indicador grande: se lee de reojo, a un brazo. */
export const ladoCorto: Record<Lado, string> = {
  izq: 'IZQ',
  der: 'DER',
  frente: 'FRENTE',
}

/**
 * A dónde va el animal que sale por ese lado. Son de naturalezas distintas y
 * no se pueden mezclar: mandar a "venta" no cambia dónde está parado el
 * animal, pero mandarlo al 6B sí.
 */
export type Destino =
  | { k: 'potrero'; id: string; nombre: string }
  | { k: 'venta' }
  | { k: 'corral'; nombre: string }
  /** Vuelve de donde vino: la salida existe físicamente pero no mueve nada. */
  | { k: 'queda' }

export function destinoLabel(d: Destino): string {
  if (d.k === 'potrero') return `Potrero ${d.nombre}`
  if (d.k === 'venta') return 'Venta'
  if (d.k === 'corral') return d.nombre
  return 'Vuelve al potrero'
}

export type SalidaConfig = {
  lado: Lado
  destino: Destino
}

/**
 * El plan del aparte: qué hay en cada lado y qué categoría va a cada uno.
 *
 * `porCategoria` es lo que permite trabajar con el rodeo mezclado. Se arma una
 * vez, antes de que entre el primer animal, y después el sistema resuelve solo.
 */
/**
 * De dónde sale el lado de cada animal. Es la única diferencia entre destetar,
 * apartar y tactar — el resto del mecanismo es idéntico.
 *
 *  · `categoria` → lo sabe el sistema por la caravana. Cero toques.
 *  · `libre`     → lo elige el operario y DURA hasta que mueva la puerta.
 *  · `resultado` → sale del toque que ya se hace igual (preñada / vacía).
 */
export type ModoSalida = 'categoria' | 'libre' | 'resultado'

export type PlanSalidas = {
  modo: ModoSalida
  salidas: SalidaConfig[]
  /** categoría → lado. Lo que no esté mapeado no se aparta: se queda. */
  porCategoria: Partial<Record<CategoriaAnimal, Lado>>
  /** Para `resultado`: qué opción del toque manda a qué lado. */
  porResultado?: Record<string, Lado>
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
 * Mapeo por defecto de un destete: madres a un lado, crías al otro. Es el
 * único caso donde el sistema puede proponerlo solo, porque la separación es
 * exactamente la que define el trabajo.
 */
export function mapeoDestete(
  presentes: CategoriaAnimal[],
): Partial<Record<CategoriaAnimal, Lado>> {
  const m: Partial<Record<CategoriaAnimal, Lado>> = {}
  for (const c of presentes) {
    if (MADRES.includes(c)) m[c] = 'izq'
    else if (CRIAS.includes(c)) m[c] = 'der'
  }
  return m
}

/** El lado que le toca a un animal, o null si esa categoría no se aparta. */
export function ladoDe(
  plan: PlanSalidas,
  categoria: CategoriaAnimal,
): Lado | null {
  return plan.porCategoria[categoria] ?? null
}

export function salidaDe(plan: PlanSalidas, lado: Lado): SalidaConfig | null {
  return plan.salidas.find((s) => s.lado === lado) ?? null
}

/** Cuántas categorías presentes quedaron sin lado: se avisa antes de arrancar. */
export function sinAsignar(
  plan: PlanSalidas,
  presentes: CategoriaAnimal[],
): CategoriaAnimal[] {
  return presentes.filter((c) => !plan.porCategoria[c])
}

/**
 * El color de cada lado es IDENTIDAD: el mismo en el prearmado y en el cartel
 * grande del trabajo. El operario aprende "verde = izquierda" una vez y después
 * lo lee sin leer.
 */
export const colorLado: Record<Lado, { borde: string; fondo: string; tinta: string }> = {
  izq: { borde: 'var(--c-ok)', fondo: 'var(--c-ok-soft)', tinta: 'var(--c-ok-deep)' },
  der: { borde: 'var(--c-warn)', fondo: 'var(--c-warn-soft)', tinta: 'var(--c-warn-deep)' },
  frente: { borde: '#3b6bd4', fondo: '#e7eeff', tinta: '#26439a' },
}
