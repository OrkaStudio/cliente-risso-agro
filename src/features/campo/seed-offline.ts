import { fetchRefs as fetchPlataRefs } from './plata/api'
import { platadb } from './plata/db'

/**
 * Sembrado offline CENTRALIZADO del Modo Campo. Antes cada feature bajaba su
 * cache SÓLO al abrir su pantalla con señal → había que "abrir con wifi y
 * navegar a cada apartado" antes de ir al campo. Ahora estas funciones se
 * llaman de una, apenas hay login + señal (ver useSeedOffline), así el teléfono
 * queda listo para el campo sin que el productor tenga que acordarse de nada.
 *
 * Desde el 18/11 sólo Plata: la recorrida y la manga salieron de la app (se hacen por
 * WhatsApp con el bot) y están en archivo/. Bajar sus datos en cada carga era trabajo de más.
 *
 * Cada una escribe en la Dexie de su feature. Idempotente (pisa el cache):
 * reintentar es inofensivo. Son la ÚNICA implementación del sembrado — los
 * hooks de cada feature (hoy, usePlata) las reutilizan.
 */

/**
 * Single-flight por feature: si un sembrado ya está EN VUELO, la segunda
 * llamada reusa la misma promesa en vez de disparar otro fetch. Deduplica los
 * dos disparos que ocurren al abrir el Modo Campo (el seeder central del shell
 * + el auto-seed del hook de la página). No afecta un refresco manual posterior
 * (para entonces el vuelo ya terminó y se limpió).
 */
const enVuelo = new Map<string, Promise<void>>()
function unSoloVuelo(key: string, fn: () => Promise<void>): Promise<void> {
  const existente = enVuelo.get(key)
  if (existente) return existente
  const p = fn().finally(() => enVuelo.delete(key))
  enVuelo.set(key, p)
  return p
}

/** Categorías + campos para cargar plata sin señal. */
export function sembrarPlata(): Promise<void> {
  return unSoloVuelo('plata', async () => {
    const { categorias, campos } = await fetchPlataRefs()
    await platadb.refs.put({ id: 'refs', categorias, campos, updated_at: Date.now() })
  })
}

export type FeatureSeed = 'ok' | 'fallo'
export type SeedDetalle = {
  plata: FeatureSeed
}
export type SeedResultado = {
  ok: boolean
  parcial: boolean
  detalle: SeedDetalle
  error?: string
}

/**
 * Baja TODO en paralelo. Si algo falla, sigue con lo demás y reporta `parcial`
 * (así una parte cacheada no se pierde por otra que falló). Devuelve el estado
 * REAL por feature (`detalle`) para que la UI muestre qué quedó guardado.
 */
export async function sembrarOffline(): Promise<SeedResultado> {
  try {
    await sembrarPlata()
    return { ok: true, parcial: false, detalle: { plata: 'ok' } }
  } catch (e) {
    return { ok: false, parcial: false, detalle: { plata: 'fallo' }, error: e instanceof Error ? e.message : 'No se pudo preparar todo' }
  }
}
