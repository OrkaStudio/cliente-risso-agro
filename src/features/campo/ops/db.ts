import Dexie, { type Table } from 'dexie'
import type { CategoriaAnimal } from '../recorrida/api'

// Cola local de OPERACIONES de hacienda declaradas en el campo (IndexedDB vía
// Dexie), separada de la recorrida y la manga. Vive en el teléfono y sobrevive
// a cierres / falta de señal.
//
// Fase 1: solo NACIMIENTOS. Fase 2/3 sumarán bajas y movimientos como más
// variantes de `OpItem` sobre esta MISMA cola (append-only, una fila por
// operación declarada, datos inmutables → nunca hay snapshot viejo que pisar,
// así que no necesita el compare-and-set del outbox single-row de la recorrida).
//
// La PK `cliente_id` (uuid de cliente) es la CLAVE DE IDEMPOTENCIA: el drenado
// marca la fila `sincronizada` por ese id, así reintentar no reencola. La
// idempotencia server-side (sobrevivir a un ACK perdido a mitad de vuelo) la
// agrega la migración `operacion_campo` pasando el mismo id a la RPC.

export type OpEstado = 'pendiente' | 'sincronizada' | 'error'

/** Nacimiento declarado en un potrero: crea N animal/es sin caravana. */
export type OpNacimiento = {
  cliente_id: string
  tipo: 'nacimiento'
  empresa_id: string
  potrero_id: string
  /** Snapshot del nombre del potrero: se muestra sin depender del cache de refs. */
  potrero_nombre: string
  /** Tropa destino (null = queda suelto). */
  lote_id: string | null
  lote_nombre: string | null
  /** ternero (macho) / ternera (hembra). */
  categoria: CategoriaAnimal
  cantidad: number
  /**
   * Fecha REAL del hecho (la de la recorrida), no la de la sincronización. Un
   * nacimiento anotado sin señal el lunes y drenado el jueves tiene que quedar
   * fechado el lunes: es la fecha que después manda el destete y la edad.
   * Opcional por compatibilidad con ítems encolados antes de esta versión.
   */
  fecha?: string
  /** Recorrida en la que se declaró (trazabilidad hacia Oficina). */
  recorrida_id?: string
  estado: OpEstado
  error: string | null
  created_at: number
}

/** Cuántos de cada categoría se llevan / se anotan. */
export type CantidadPorCategoria = {
  categoria: CategoriaAnimal
  cantidad: number
}

/**
 * Movimiento declarado en el campo: la tropa pasa de un potrero a otro. A
 * diferencia del nacimiento toca DOS potreros con signo opuesto.
 *
 * `todo` = se llevó la tropa entera (RPC en modo `p_todo`). Es el modo por
 * defecto del campo y el único robusto sin señal: el server mueve LO QUE HAYA
 * en el potrero, mientras que el modo por cantidad levanta excepción si el
 * número no coincide ("Pediste mover 50 de vaca pero hay 47") — y un movimiento
 * rechazado, cuando los animales ya cruzaron el alambre de verdad, deja la
 * realidad y la base divergentes sin nadie ahí para arreglarlo.
 *
 * `movidos` es un SNAPSHOT de la composición al declarar: es lo que permite
 * derivar el esperado de los dos potreros sin conexión. Si el server termina
 * moviendo otra cantidad (porque algo cambió), el delta desaparece al
 * sincronizar y las existencias reales mandan.
 */
export type OpMovimiento = {
  cliente_id: string
  tipo: 'movimiento'
  empresa_id: string
  potrero_origen_id: string
  potrero_origen_nombre: string
  potrero_destino_id: string
  potrero_destino_nombre: string
  /** Tropa que se mueve (null = animales sueltos del potrero). */
  lote_id: string | null
  lote_nombre: string | null
  movidos: CantidadPorCategoria[]
  todo: boolean
  /** Fecha REAL del hecho (la de la recorrida), no la de la sincronización. */
  fecha?: string
  recorrida_id?: string
  estado: OpEstado
  error: string | null
  created_at: number
}

export type OpItem = OpNacimiento | OpMovimiento

/** Un efecto con SIGNO sobre un potrero y una categoría. */
type Efecto = {
  potreroId: string
  categoria: CategoriaAnimal
  delta: number
}

/**
 * Efectos con signo de UNA operación. Única fuente de verdad de "qué le hace
 * esta operación al campo": las dos funciones de delta la comparten, así no
 * pueden desincronizarse cuando se sumen bajas en Fase 3.
 */
function efectosDe(it: OpItem): Efecto[] {
  if (it.tipo === 'nacimiento') {
    return [
      { potreroId: it.potrero_id, categoria: it.categoria, delta: it.cantidad },
    ]
  }
  // Movimiento: resta en el origen y suma en el destino, categoría por categoría.
  return it.movidos.flatMap((m) => [
    { potreroId: it.potrero_origen_id, categoria: m.categoria, delta: -m.cantidad },
    { potreroId: it.potrero_destino_id, categoria: m.categoria, delta: m.cantidad },
  ])
}

/** Los potreros que una operación toca (uno el nacimiento, dos el movimiento). */
export function potrerosDe(it: OpItem): string[] {
  return it.tipo === 'nacimiento'
    ? [it.potrero_id]
    : [it.potrero_origen_id, it.potrero_destino_id]
}

/**
 * Efecto NETO por potrero de las operaciones que todavía no sincronizaron.
 * Es la base del "esperado derivado" (doctrina #5: existencias del server ±
 * pendientes) — nunca un cache mutado, así un refresh de refs no puede pisar lo
 * declarado ni una operación declarada reaparece como discrepancia.
 */
export function deltaPorPotrero(items: OpItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    if (it.estado === 'sincronizada') continue
    for (const e of efectosDe(it)) {
      m.set(e.potreroId, (m.get(e.potreroId) ?? 0) + e.delta)
    }
  }
  return m
}

/**
 * Mismo efecto neto, pero DESGLOSADO POR CATEGORÍA. Sin esto el panel del
 * potrero mostraba un total derivado (69) sobre una composición del server que
 * sumaba otra cosa (66): el productor hacía la resta y desconfiaba. La
 * composición se deriva igual que el total — server ± pendientes.
 */
export function deltaCategoriasPorPotrero(
  items: OpItem[],
): Map<string, Map<CategoriaAnimal, number>> {
  const m = new Map<string, Map<CategoriaAnimal, number>>()
  for (const it of items) {
    if (it.estado === 'sincronizada') continue
    for (const e of efectosDe(it)) {
      const porCat = m.get(e.potreroId) ?? new Map<CategoriaAnimal, number>()
      porCat.set(e.categoria, (porCat.get(e.categoria) ?? 0) + e.delta)
      m.set(e.potreroId, porCat)
    }
  }
  return m
}

class OpsDB extends Dexie {
  outbox!: Table<OpItem, string>

  constructor() {
    super('risso-ops')
    this.version(1).stores({
      // PK cliente_id + índices para filtrar por estado y por potrero.
      outbox: 'cliente_id, estado, potrero_id, tipo',
    })
  }
}

export const opsdb = new OpsDB()
