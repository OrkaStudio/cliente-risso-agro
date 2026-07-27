import { fetchRefs as fetchRecorridaRefs } from './recorrida/api'
import { recdb } from './recorrida/db'
import { fetchSinCaravana } from './manga/api'
import { mangadb } from './manga/db'
import { fetchRefs as fetchPlataRefs } from './plata/api'
import { platadb } from './plata/db'

/**
 * Sembrado offline CENTRALIZADO del Modo Campo. Antes cada feature bajaba su
 * cache SÓLO al abrir su pantalla con señal → había que "abrir con wifi y
 * navegar a cada apartado" antes de ir al campo. Ahora estas funciones se
 * llaman de una, apenas hay login + señal (ver useSeedOffline), así el teléfono
 * queda listo para el campo sin que el productor tenga que acordarse de nada.
 *
 * Cada una escribe en la Dexie de su feature. Idempotente (pisa el cache):
 * reintentar es inofensivo. Son la ÚNICA implementación del sembrado — los
 * hooks de cada feature (useRecorrida/useManga/usePlata) las reutilizan.
 */

/** Campos + potreros (con stock y composición) de la recorrida. */
export async function sembrarRecorrida(): Promise<void> {
  const { campos, potreros } = await fetchRecorridaRefs()
  await recdb.refs.put({ id: 'refs', campos, potreros, updated_at: Date.now() })
}

/** Animales sin caravana + RFIDs en uso, para la manga. Preserva los que ya se
 *  caravanearon en el teléfono (subidos o no): no se pisan ni se pierden. */
export async function sembrarManga(): Promise<void> {
  const { animales: frescos, rfidsEnUso } = await fetchSinCaravana()
  const locales = await mangadb.animales.where('caravaneado').equals(1).toArray()
  const hechosLocal = new Set(locales.map((a) => a.id))
  await mangadb.animales.clear()
  await mangadb.animales.bulkPut([
    ...locales,
    ...frescos
      .filter((a) => !hechosLocal.has(a.id))
      .map((a) => ({ ...a, caravaneado: 0 as const })),
  ])
  await mangadb.refs.put({ id: 'rfids', rfids: rfidsEnUso, updated_at: Date.now() })
}

/** Categorías + campos para cargar plata sin señal. */
export async function sembrarPlata(): Promise<void> {
  const { categorias, campos } = await fetchPlataRefs()
  await platadb.refs.put({ id: 'refs', categorias, campos, updated_at: Date.now() })
}

export type SeedResultado = { ok: boolean; parcial: boolean; error?: string }

/**
 * Baja TODO en paralelo. Si algo falla, sigue con lo demás y reporta `parcial`
 * (así una parte cacheada no se pierde por otra que falló).
 */
export async function sembrarOffline(): Promise<SeedResultado> {
  const rs = await Promise.allSettled([
    sembrarRecorrida(),
    sembrarManga(),
    sembrarPlata(),
  ])
  const fallos = rs.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  )
  if (fallos.length === 0) return { ok: true, parcial: false }
  const error =
    fallos[0].reason instanceof Error
      ? fallos[0].reason.message
      : 'No se pudo preparar todo'
  return { ok: false, parcial: fallos.length < rs.length, error }
}
