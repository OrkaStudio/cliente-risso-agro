import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']

/**
 * Señales del rodeo — derivadas del historial append-only (`evento`), sin
 * columnas nuevas: cada tipo de evento guarda su detalle en `evento.datos`
 * (JSONB). Esquema por tipo (lo escribe el diálogo de la ficha hoy; la manga
 * offline lo va a escribir igual en su fase):
 *
 * - pesaje:  { kg: number }
 * - tacto:   { resultado: 'prenada' | 'vacia', meses?: number }
 * - sanidad: { tratamiento?: string, retiro_hasta?: 'YYYY-MM-DD' }
 * - parto:   {} (la fecha del evento es la del parto)
 */

export type EventoSenal = {
  animal_id: string
  tipo: string
  fecha: string
  datos: unknown
}

/** Lo último que el historial sabe de un animal (para señales y datos clave). */
export type ResumenAnimal = {
  /** Fin del retiro sanitario más lejano registrado (vigente si >= hoy). */
  retiroHasta: string | null
  /** Nombre del último tratamiento con retiro (para mostrar el porqué). */
  tratamiento: string | null
  /** Último tacto positivo sin un parto posterior que lo cierre. */
  prenada: { fecha: string; meses: number | null } | null
  ultimoPeso: { kg: number; fecha: string } | null
  partos: number
  ultimoParto: string | null
}

const RESUMEN_VACIO: ResumenAnimal = {
  retiroHasta: null,
  tratamiento: null,
  prenada: null,
  ultimoPeso: null,
  partos: 0,
  ultimoParto: null,
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function campo(datos: unknown, k: string): unknown {
  return datos && typeof datos === 'object' ? (datos as Record<string, unknown>)[k] : undefined
}

/**
 * Resume los eventos de cada animal. `eventos` puede venir en cualquier orden;
 * se resuelve por fecha (último tacto, último pesaje, retiro más lejano).
 */
export function resumirEventos(eventos: EventoSenal[]): Map<string, ResumenAnimal> {
  const orden = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const map = new Map<string, ResumenAnimal>()
  for (const ev of orden) {
    const r = map.get(ev.animal_id) ?? { ...RESUMEN_VACIO }
    switch (ev.tipo) {
      case 'pesaje': {
        const kg = num(campo(ev.datos, 'kg'))
        if (kg) r.ultimoPeso = { kg, fecha: ev.fecha }
        break
      }
      case 'tacto': {
        const res = campo(ev.datos, 'resultado')
        r.prenada =
          res === 'prenada'
            ? { fecha: ev.fecha, meses: num(campo(ev.datos, 'meses')) }
            : null
        break
      }
      case 'sanidad': {
        const hasta = campo(ev.datos, 'retiro_hasta')
        if (typeof hasta === 'string' && hasta) {
          if (!r.retiroHasta || hasta > r.retiroHasta) {
            r.retiroHasta = hasta
            const t = campo(ev.datos, 'tratamiento')
            r.tratamiento = typeof t === 'string' && t ? t : null
          }
        }
        break
      }
      case 'parto': {
        r.partos += 1
        r.ultimoParto = ev.fecha
        // Un parto posterior al tacto cierra la preñez.
        if (r.prenada && r.prenada.fecha <= ev.fecha) r.prenada = null
        break
      }
    }
    map.set(ev.animal_id, r)
  }
  return map
}

/* ===== Señales por animal ===== */

export type Senal = 'retiro' | 'prenada' | 'destete' | 'vender'

/** Novillos/capones listos para vender a partir de este peso (ajustable). */
export const PESO_VENTA_KG = 400
/** Ventana de destete: terneros/as de esta edad en meses. */
export const DESTETE_DESDE_M = 6
export const DESTETE_HASTA_M = 8

export function edadMeses(fechaNac: string | null, hoy = new Date()): number | null {
  if (!fechaNac) return null
  const [y, m, d] = fechaNac.split('-').map(Number)
  let meses = (hoy.getFullYear() - y) * 12 + (hoy.getMonth() - (m - 1))
  if (hoy.getDate() < d) meses -= 1
  return meses >= 0 ? meses : null
}

const CRIA: Categoria[] = ['ternero', 'ternera', 'cordero', 'cordera']
const ENGORDE: Categoria[] = ['novillo', 'capon']

export function senalesDe(
  animal: { categoria: Categoria | null; fecha_nacimiento: string | null },
  resumen: ResumenAnimal | undefined,
  hoyISO: string,
): Senal[] {
  const out: Senal[] = []
  const r = resumen ?? RESUMEN_VACIO
  if (r.retiroHasta && r.retiroHasta >= hoyISO) out.push('retiro')
  if (r.prenada) out.push('prenada')
  const meses = edadMeses(animal.fecha_nacimiento)
  if (
    animal.categoria &&
    CRIA.includes(animal.categoria) &&
    meses != null &&
    meses >= DESTETE_DESDE_M &&
    meses <= DESTETE_HASTA_M
  )
    out.push('destete')
  if (
    animal.categoria &&
    ENGORDE.includes(animal.categoria) &&
    r.ultimoPeso &&
    r.ultimoPeso.kg >= PESO_VENTA_KG
  )
    out.push('vender')
  return out
}

/**
 * Parto estimado desde el tacto: gestación bovina ~9,3 meses. Si el tacto dijo
 * "6 meses", faltan ~3,3. Devuelve ISO del mes estimado (día 15) o null.
 */
export function partoEstimado(prenada: { fecha: string; meses: number | null }): string | null {
  const [y, m] = prenada.fecha.split('-').map(Number)
  const faltan = Math.max(0, Math.round(9.3 - (prenada.meses ?? 0)))
  const total = (m - 1) + faltan
  const yy = y + Math.floor(total / 12)
  const mm = (total % 12) + 1
  return `${yy}-${String(mm).padStart(2, '0')}-15`
}
