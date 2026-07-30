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

export type OpItem = OpNacimiento

/**
 * Efecto NETO por potrero de las operaciones que todavía no sincronizaron.
 * Es la base del "esperado derivado" (doctrina #5: existencias del server ±
 * pendientes) — nunca un cache mutado, así un refresh de refs no puede pisar lo
 * declarado ni una operación declarada reaparece como discrepancia.
 * Nacimiento suma; bajas/movimientos se sumarán con signo en Fase 2/3.
 */
export function deltaPorPotrero(items: OpItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    if (it.estado === 'sincronizada') continue
    if (it.tipo === 'nacimiento') {
      m.set(it.potrero_id, (m.get(it.potrero_id) ?? 0) + it.cantidad)
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
    if (it.tipo === 'nacimiento') {
      const porCat = m.get(it.potrero_id) ?? new Map<CategoriaAnimal, number>()
      porCat.set(it.categoria, (porCat.get(it.categoria) ?? 0) + it.cantidad)
      m.set(it.potrero_id, porCat)
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
