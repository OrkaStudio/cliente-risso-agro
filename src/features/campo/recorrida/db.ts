import Dexie, { type Table } from 'dexie'
import type {
  AguaEstado,
  CampoRec,
  CultivoEstado,
  ElectricoEstado,
  EstadoCiclo,
  PastoEstado,
  PotreroRec,
  UltimaObs,
} from './api'

// Base local de la Recorrida (IndexedDB vía Dexie), separada de la manga.
//   · refs:     cache de campos + potreros de TODA la empresa (se refresca con
//     señal) — permite ARRANCAR una recorrida sin conexión. Singleton.
//   · meta:     la recorrida en curso (campo + recorrida_id) — singleton.
//   · potreros: cache de los potreros del campo, con flag `hecho`.
//   · obs:      cola (outbox) de observaciones a subir; idempotente por potrero.

export type RecRefs = {
  id: 'refs'
  campos: CampoRec[]
  /** Potreros de todos los campos (con campo_id para filtrar). */
  potreros: (PotreroRec & { campo_id: string })[]
  updated_at: number
}

export type RecMeta = {
  id: 'actual'
  recorrida_id: string
  campo_id: string
  campo_nombre: string
  empresa_id: string
  fecha: string
  lluvia_mm: number | null
  lluvia_ok: 0 | 1
  /** 1 = la fila `recorrida` ya existe en el servidor. 0 = se arrancó offline
   *  con UUID de cliente; el drenado la crea (o adopta la del día) antes de
   *  subir observaciones. */
  remota: 0 | 1
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
  /** Polígono [lat,lng][] (si Oficina lo dibujó) — croquis del campo. */
  poligono: [number, number][] | null
  /** Última observación conocida ("igual que la última vez"). */
  ultima: UltimaObs | null
  /** 1 = el potrero fue eliminado en Oficina DURANTE la recorrida; se
   *  conserva si tiene observación local (nunca se pierde en silencio). */
  eliminado?: 0 | 1
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
  cultivo: CultivoEstado | null
  /** Nota de voz grabada offline (Blob local hasta que sube). */
  audio: Blob | null
  /** Path en storage una vez subido (se manda como audio_url). */
  audio_path: string | null
  audio_subido: 0 | 1
  estado: EstadoObs
  error: string | null
  updated_at: number
}

class RecorridaDB extends Dexie {
  meta!: Table<RecMeta, string>
  potreros!: Table<RecPotrero, string>
  obs!: Table<RecObs, string>
  refs!: Table<RecRefs, string>

  constructor() {
    super('risso-recorrida')
    this.version(1).stores({
      meta: 'id',
      potreros: 'id, campo_id, hecho',
      obs: 'potrero_id, estado',
    })
    // v2: cache de campos+potreros (arrancar la recorrida sin señal).
    this.version(2).stores({
      refs: 'id',
    })
  }
}

export const recdb = new RecorridaDB()
