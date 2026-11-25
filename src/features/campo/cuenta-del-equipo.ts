import { platadb } from './plata/db'

/**
 * Lo que el Modo Campo guarda en el teléfono para andar sin señal (campos,
 * potreros, animales y lo cargado que todavía no subió) es de UNA cuenta.
 * Quien está en varias (un veterinario que atiende varios campos, 14/11) no
 * puede ver en una cuenta lo guardado de otra: al entrar con otra cuenta se
 * vacía. Nunca se borra algo sin subir: con cargas pendientes no se cambia de
 * cuenta (ver `useCambiarCuenta`) y, si igual quedaran, se conservan.
 */

const DUENA = 'troppero.cuenta.caches'
const SEMBRADO = 'campo.seed.lastOk.v1' // el de use-seed-offline: sin él se vuelve a bajar todo

// Sólo Plata desde el 18/11: la recorrida y la manga salieron de la app (archivo/). Contar sus
// colas viejas trabaría el cambio de cuenta para siempre, porque ya no hay cómo subirlas.
const BASES = [platadb]
// Lo cargado sin señal que espera subir: nunca se borra solo.
const COLAS = [platadb.outbox] as const

/** Cuántas cargas hechas sin señal todavía no subieron (las que fallaron también: no se pierden). */
export async function cargasSinSubir(): Promise<number> {
  const cuentas = await Promise.all(
    COLAS.map((t) => t.filter((x: { estado: string }) => x.estado !== 'sincronizada').count()),
  )
  return cuentas.reduce((s, n) => s + n, 0)
}

function leerDuena(): string | null {
  try {
    return localStorage.getItem(DUENA)
  } catch {
    return null
  }
}

function guardarDuena(empresaId: string) {
  try {
    localStorage.setItem(DUENA, empresaId)
  } catch {
    /* sin almacenamiento: se revisa de nuevo la próxima vez */
  }
}

/** Cómo quedó lo guardado en el teléfono para la cuenta con la que se entra. */
export type Preparado = { listo: true } | { listo: false; duena: string; cuantas: number }

/**
 * Deja lo guardado en el teléfono listo para esta cuenta. Si era de otra y no
 * hay nada sin subir, se vacía (se vuelve a bajar con señal). Lo guardado de
 * antes de esta revisión (sin dueña anotada) es de la cuenta con la que se entra.
 *
 * Si hay cargas sin subir de otra cuenta suya, no se entra: hay que volver a
 * ésa hasta que suban (se llega acá aceptando una invitación o sumando el campo
 * propio sin señal; desde la app el cambio ya se frena antes). Si esa cuenta ya
 * no es suya (lo sacaron), sus cargas no se pueden subir pero tampoco se borran:
 * se vacía sólo lo que se muestra.
 */
export async function prepararParaLaCuenta(empresaId: string, suyas: string[]): Promise<Preparado> {
  const duena = leerDuena()
  if (duena === empresaId) return { listo: true }
  if (duena === null) {
    guardarDuena(empresaId)
    return { listo: true }
  }
  const cuantas = await cargasSinSubir()
  if (cuantas > 0 && suyas.includes(duena)) return { listo: false, duena, cuantas }
  const colas = new Set<unknown>(COLAS)
  await Promise.all(BASES.flatMap((db) => db.tables.filter((t) => cuantas === 0 || !colas.has(t)).map((t) => t.clear())))
  try {
    localStorage.removeItem(SEMBRADO)
  } catch {
    /* sin almacenamiento: el sembrado igual corre al tener señal */
  }
  guardarDuena(empresaId)
  return { listo: true }
}
