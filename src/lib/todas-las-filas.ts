/**
 * Todas las filas de una consulta, de a tandas.
 *
 * Supabase devuelve como mucho 1000 filas por pedido (max_rows) y lo hace en silencio: con
 * más de 1000 movimientos, la lista dejaba afuera lo de hoy y los totales de Plata quedaban
 * mal sin ningún aviso (18/11). Acá se pide de a TANDA hasta que una vuelve incompleta.
 *
 * `pedir(desde, hasta)` arma la consulta de nuevo en cada tanda, con `.range(desde, hasta)`.
 * La consulta tiene que tener un orden total (desempatar por `id`): si dos filas empatan en
 * el orden, entre una tanda y otra se pueden repetir o saltear.
 */
import { errorDeBase } from './error-de-base'

export const TANDA = 1000

type Respuesta<T> = { data: T[] | null; error: { message: string; code?: string | null } | null }

export async function todasLasFilas<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += TANDA) {
    const { data, error } = await pedir(desde, desde + TANDA - 1)
    if (error) throw errorDeBase(error)
    const filas = data ?? []
    todas.push(...filas)
    if (filas.length < TANDA) return todas
  }
}
