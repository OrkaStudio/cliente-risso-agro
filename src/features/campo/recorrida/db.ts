import Dexie, { type Table } from 'dexie'
import type {
  AguaEstado,
  CampoRec,
  CompoItem,
  CultivoEstado,
  ElectricoEstado,
  EstadoCiclo,
  PastoEstado,
  PotreroRec,
  TropaRec,
  UltimaObs,
} from './api'

// Base local de la Recorrida (IndexedDB vía Dexie), separada de la manga.
//   · refs:       cache de campos + potreros de TODA la empresa (se refresca con
//     señal) — permite ARRANCAR una recorrida sin conexión. Singleton.
//   · recorridas: OUTBOX de cabeceras. Toda recorrida con algo sin subir vive
//     acá, esté activa o no — incluye lo necesario (campo/empresa/fecha) para
//     crear su fila remota más tarde, sin depender de la sesión en curso.
//   · meta:       puntero a la recorrida ACTIVA (singleton).
//   · potreros:   cache de los potreros del campo activo, con flag `hecho`.
//   · outbox:     cola de observaciones; PK compuesta [recorrida_id+potrero_id]
//     para que dos recorridas pendientes del mismo potrero no se pisen.
//
// Por qué el outbox está separado de la sesión: arrancar una recorrida nueva
// NO puede destruir lo que otra dejó sin subir. Ver la spec del ciclo de la
// jornada (2026-07-22) — con `PendienteSync` bloqueando la pantalla este
// camino era inalcanzable; al permitir arrancar otro campo, se vuelve real.

export type RecRefs = {
  id: 'refs'
  campos: CampoRec[]
  /** Potreros de todos los campos (con campo_id para filtrar). */
  potreros: (PotreroRec & { campo_id: string })[]
  updated_at: number
}

/** Puntero a la recorrida activa. `null` = ninguna abierta. */
export type RecPuntero = {
  id: 'actual'
  recorrida_id: string | null
}

/** Cabecera de una recorrida: la activa y toda otra que deba algo al servidor. */
export type RecSesion = {
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
  /** Composición por categoría (última sincronización). Puede faltar en un
   *  cache viejo previo a esta feature → tratar como [] al leer. */
  composicion?: CompoItem[]
  /** Tropas con animales en el potrero (para asignar un nacimiento). Puede
   *  faltar en un cache viejo → tratar como [] al leer. */
  tropas?: TropaRec[]
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
  /** Nombre del potrero al momento de observarlo. Snapshot local: si Oficina
   *  lo borra, la lista (derivada de refs) lo perdería — con esto se sigue
   *  mostrando ("nunca se pierde en silencio"). No viaja al servidor. */
  potrero_nombre?: string
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
  meta!: Table<RecPuntero, string>
  recorridas!: Table<RecSesion, string>
  outbox!: Table<RecObs, [string, string]>
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
    // v3: el outbox deja de vivir dentro de la sesión. `meta` pasa de guardar
    // la recorrida entera a ser un puntero; la cabecera se muda a `recorridas`
    // y las observaciones a `outbox` (PK compuesta). Migra lo que haya sin
    // subir — el padre puede tener observaciones pendientes en el teléfono.
    this.version(3)
      .stores({
        recorridas: 'recorrida_id, terminada',
        outbox: '[recorrida_id+potrero_id], estado, recorrida_id',
      })
      .upgrade(async (tx) => {
        const vieja = await tx.table('meta').get('actual')
        if (!vieja) return
        const cabecera = { ...vieja }
        delete (cabecera as Record<string, unknown>).id
        await tx.table('recorridas').put(cabecera)
        await tx.table('meta').put({ id: 'actual', recorrida_id: vieja.recorrida_id })
        const obsViejas = await tx.table('obs').toArray()
        for (const o of obsViejas) {
          await tx.table('outbox').put({ ...o, recorrida_id: o.recorrida_id ?? vieja.recorrida_id })
        }
      })
    // v4: recién acá se borra la tabla vieja — Dexie corre las versiones en
    // orden, así que el upgrade de v3 todavía la pudo leer.
    this.version(4).stores({ obs: null })
    // v5: se DROPEA el cache de potreros. La lista de potreros pasa a DERIVARSE
    // de `refs` (filtrada por el campo activo) y el flag `hecho` del `outbox`
    // (¿hay observación para [recorrida_id+potrero_id]?). Sin cache mutable:
    //   · reconciliación Oficina→Campo automática (refs cambia → lista cambia),
    //   · cambiar de campo = mover el puntero (no se borra ni se pierde nada),
    //   · varias recorridas abiertas conviven → pausar/retomar por campo.
    this.version(5).stores({ potreros: null })
  }
}

export const recdb = new RecorridaDB()
