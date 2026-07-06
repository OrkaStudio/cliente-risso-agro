import Dexie, { type Table } from 'dexie'
import type {
  AguaEstado,
  ElectricoEstado,
  EstadoCiclo,
  PastoEstado,
} from './api'

// Base local de la Recorrida (IndexedDB vía Dexie), separada de la manga.
//   · meta:     la recorrida en curso (campo + recorrida_id) — singleton.
//   · potreros: cache de los potreros del campo, con flag `hecho`.
//   · obs:      cola (outbox) de observaciones a subir; idempotente por potrero.

export type RecMeta = {
  id: 'actual'
  recorrida_id: string
  campo_id: string
  campo_nombre: string
  empresa_id: string
  fecha: string
  lluvia_mm: number | null
  lluvia_ok: 0 | 1
  /** 1 = el usuario terminó la recorrida pero queda algo sin subir. La sesión
   *  local NO se borra hasta que todo sincronice (si no, terminar sin señal
   *  perdería las observaciones pendientes). */
  terminada: 0 | 1
}

export type RecPotrero = {
  id: string
  campo_id: string
  nombre: string
  estado_ciclo: EstadoCiclo
  cabezas: number
  hecho: 0 | 1
}

export type EstadoObs = 'pendiente' | 'sincronizada' | 'error'

export type RecObs = {
  potrero_id: string // PK: una observación por potrero (idempotente)
  recorrida_id: string
  empresa_id: string
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
  estado: EstadoObs
  error: string | null
  updated_at: number
}

class RecorridaDB extends Dexie {
  meta!: Table<RecMeta, string>
  potreros!: Table<RecPotrero, string>
  obs!: Table<RecObs, string>

  constructor() {
    super('risso-recorrida')
    this.version(1).stores({
      meta: 'id',
      potreros: 'id, campo_id, hecho',
      obs: 'potrero_id, estado',
    })
  }
}

export const recdb = new RecorridaDB()
