/**
 * Qué se hace en la manga. Es la PRIMERA pregunta del flujo, porque decide
 * todo lo que sigue: qué se prearma, qué pide cada escaneo y cómo se ve la
 * pantalla de trabajo.
 *
 * Lo que ordena el diseño no es la lista, sino **cuánto dato pide cada
 * actividad por animal** — de eso depende cuánta pantalla necesita:
 *
 *   · `ninguno`  → el dato es de la sesión entera, no del animal. Se prearma
 *                  una vez y son N escaneos con CERO toques: el teléfono puede
 *                  quedar en el bolsillo y el ritmo lo marca el animal.
 *   · `modo`     → hay un dato que cambia, pero de a tandas y no por cabeza
 *                  (la salida del aparte cambia cuando se mueve la puerta de la
 *                  manga, no en cada animal).
 *   · `porAnimal`→ el dato cambia en cada uno y no hay forma de adivinarlo.
 *                  Son las únicas que obligan a mirar la pantalla.
 *
 * La lista es la estándar del rubro, no la de un productor en particular: esto
 * se usa en varios campos y con distintas mangas.
 */

export type ClaveActividad =
  | 'vacunar'
  | 'apartar'
  | 'tacto'
  | 'destetar'
  | 'yerra'
  | 'caravanear'

/** Cuánto dato pide la actividad POR ANIMAL. Ver arriba. */
export type Exigencia = 'ninguno' | 'modo' | 'porAnimal'

export type Actividad = {
  clave: ClaveActividad
  /** Cómo la llama el productor, en infinitivo (es lo que va a hacer). */
  nombre: string
  /** Una línea que aclara sin explicar de más. */
  detalle: string
  exigencia: Exigencia
  /**
   * Trabaja sobre animales que YA tienen caravana (la busca) o se la pone
   * (la crea). Caravanear es el único que crea identidad, y por eso el único
   * que necesita saber a qué tropa pertenece el animal.
   */
  creaIdentidad?: boolean
  /**
   * A qué categorías se les hace. Ausente = a cualquiera.
   *
   * No es para prohibir —el productor sabe lo que está haciendo y a veces la
   * categoría cargada está mal— sino para AVISAR cuando el escaneo no cierra:
   * tactar un ternero o castrar una vaquillona es casi siempre una caravana
   * leída de más, no una decisión. Con el teléfono guardado, ese aviso es la
   * única forma de que el error se note el mismo día.
   */
  soloCategorias?: string[]
}

/**
 * El calendario real de una manga, confirmado con el productor (03/08):
 * vacunación de varios tipos, destete, yerra, tacto, aparte y caravaneo.
 *
 * NO está pesada: el campo no tiene balanza, y una balanza sin vínculo con la
 * web obligaría a tipear los kilos de a uno — el único caso de toda la manga
 * que pediría teclado. Cuando haya integración, entra con `porAnimal`.
 */
export const ACTIVIDADES: Actividad[] = [
  {
    clave: 'vacunar',
    nombre: 'Vacunar',
    detalle: 'Aftosa, brucelosis, carbunclo…',
    exigencia: 'ninguno',
  },
  {
    clave: 'apartar',
    nombre: 'Apartar',
    detalle: 'A otro potrero, a venta o a un corral',
    exigencia: 'modo',
  },
  {
    clave: 'destetar',
    nombre: 'Destetar',
    detalle: 'Separar la cría de la madre',
    exigencia: 'ninguno',
  },
  {
    clave: 'yerra',
    nombre: 'Yerra',
    detalle: 'Castrar y marcar los terneros',
    exigencia: 'ninguno',
    soloCategorias: ['ternero'],
  },
  {
    clave: 'tacto',
    nombre: 'Tacto',
    detalle: 'Preñada o vacía',
    exigencia: 'porAnimal',
    soloCategorias: ['vaca', 'vaquillona'],
  },
  {
    clave: 'caravanear',
    nombre: 'Caravanear',
    detalle: 'Ponerle la caravana electrónica',
    exigencia: 'ninguno',
    creaIdentidad: true,
  },
]

export const actividadPorClave = new Map(ACTIVIDADES.map((a) => [a.clave, a]))

/** Tope real de salidas de una manga (dato de campo, no un límite técnico). */
export const MAX_SALIDAS = 3

/**
 * Las que ya están construidas de punta a punta. El resto se muestra pero
 * avisa que todavía no: es preferible que el productor vea el mapa completo de
 * lo que la manga va a saber hacer, a que la lista crezca sin explicación.
 */
export const ACTIVIDADES_LISTAS: ReadonlySet<ClaveActividad> = new Set([
  'caravanear',
  'vacunar',
  'destetar',
  'yerra',
  'apartar',
  'tacto',
])

export function estaLista(c: ClaveActividad): boolean {
  return ACTIVIDADES_LISTAS.has(c)
}
