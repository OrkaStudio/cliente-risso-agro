import { mangadb } from './manga/db'
import { opsdb } from './ops/db'
import { platadb } from './plata/db'
import { recdb } from './recorrida/db'

/**
 * Lo que el Modo Campo guarda en el teléfono para andar sin señal (campos,
 * potreros, animales y lo cargado que todavía no subió) es de UNA cuenta.
 * Quien está en varias (un veterinario que atiende varios campos, 14/11) no
 * puede ver en una cuenta lo guardado de otra: al entrar con otra cuenta se
 * vacía. Nunca se borra algo sin subir: con cargas pendientes no se cambia de
 * cuenta (ver `cambiarDeCuenta`) y, si igual quedaran, se conservan.
 */

const DUENA = 'troppero.cuenta.caches'
const SEMBRADO = 'campo.seed.lastOk.v1' // el de use-seed-offline: sin él se vuelve a bajar todo

const BASES = [recdb, mangadb, platadb, opsdb]

/** Cuántas cargas hechas sin señal todavía no subieron (las que fallaron también: no se pierden). */
export async function cargasSinSubir(): Promise<number> {
  const colas = [recdb.outbox, mangadb.outbox, mangadb.trabajos, mangadb.apartes, platadb.outbox, opsdb.outbox] as const
  const cuentas = await Promise.all(
    colas.map((t) => (t as typeof platadb.outbox).filter((x: { estado: string }) => x.estado !== 'sincronizada').count()),
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

/**
 * Deja lo guardado en el teléfono listo para esta cuenta. Si era de otra y no
 * hay nada sin subir, se vacía (se vuelve a bajar con señal). Lo guardado de
 * antes de esta revisión (sin dueña anotada) es de la cuenta con la que se entra.
 */
export async function prepararParaLaCuenta(empresaId: string): Promise<void> {
  const duena = leerDuena()
  if (duena === empresaId) return
  if (duena === null) {
    guardarDuena(empresaId)
    return
  }
  if ((await cargasSinSubir()) > 0) return
  await Promise.all(BASES.flatMap((db) => db.tables.map((t) => t.clear())))
  try {
    localStorage.removeItem(SEMBRADO)
  } catch {
    /* sin almacenamiento: el sembrado igual corre al tener señal */
  }
  guardarDuena(empresaId)
}
