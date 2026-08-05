import Dexie, { type Table } from 'dexie'
import type { CategoriaAnimal } from './api'

// Base local del Modo Campo (IndexedDB vía Dexie). Vive en el teléfono y
// sobrevive a cierres de la app / falta de señal. Dos tablas:
//   · animales: cache de los animales SIN caravana descargados al entrar con
//     señal. `caravaneado` pasa a 1 cuando se asignó local (sale de "quedan").
//   · outbox:   cola de asignaciones hechas offline, a drenar contra Supabase.

export type AnimalCache = {
  id: string
  empresa_id: string
  categoria: CategoriaAnimal
  potrero_id: string | null
  potrero_nombre: string | null
  lote_id: string | null
  lote_nombre: string | null
  caravaneado: 0 | 1
}

/** RFIDs vigentes de la empresa (cache): aviso instantáneo de duplicado
 *  contra TODO el rodeo, también sin señal. Singleton. */
export type RfidsCache = {
  id: 'rfids'
  rfids: string[]
  updated_at: number
}

export type EstadoOutbox = 'pendiente' | 'sincronizada' | 'error'

export type OutboxItem = {
  local_id?: number
  animal_id: string
  rfid: string
  visual: string | null
  categoria: CategoriaAnimal
  nota: string | null
  /** Nota de voz del animal (Blob local hasta que sube). */
  audio: Blob | null
  /** UUID de cliente para el path en storage (estable ante reintentos). */
  audio_id: string | null
  audio_path: string | null
  audio_subido: 0 | 1
  estado: EstadoOutbox
  error: string | null
  created_at: number
}

/**
 * Animal YA caravaneado, indexado por su RFID normalizado. Es lo que permite
 * que el bastón IDENTIFIQUE sin señal: en un trabajo (vacunar, destetar,
 * yerra) el escaneo ya no crea nada, busca acá.
 */
export type AnimalRodeo = {
  /** RFID normalizado — es la clave: es la identidad del animal en el campo. */
  rfid: string
  animal_id: string
  empresa_id: string
  categoria: CategoriaAnimal
  potrero_id: string | null
  lote_id: string | null
}

/** Qué se le hizo a un animal en la manga. Uno por animal y por trabajo. */
export type TrabajoItem = {
  /** UUID de cliente que va como `evento.id`: el reintento choca por PK y eso
   *  ES el éxito. El historial es append-only, nunca se duplica. */
  id: string
  animal_id: string
  rfid: string
  /** Valor del enum `tipo_evento`: sanidad | destete | castracion | tacto… */
  tipo: string
  /** `evento.datos` ya armado (producto, veterinario, resultado…). */
  datos: Record<string, unknown>
  /** Fecha del HECHO, no de la sincronización. */
  fecha: string
  estado: EstadoOutbox
  error: string | null
  created_at: number
}

class MangaDB extends Dexie {
  animales!: Table<AnimalCache, string>
  outbox!: Table<OutboxItem, number>
  refs!: Table<RfidsCache, string>
  rodeo!: Table<AnimalRodeo, string>
  trabajos!: Table<TrabajoItem, string>

  constructor() {
    super('risso-manga')
    this.version(1).stores({
      // PK + índices (no hace falta indexar todas las columnas)
      animales: 'id, empresa_id, caravaneado',
      outbox: '++local_id, animal_id, estado',
    })
    // v2: cache de RFIDs vigentes (duplicados offline contra todo el rodeo).
    this.version(2).stores({
      refs: 'id',
    })
    // v3: los TRABAJOS sobre animales ya caravaneados (vacunar, destetar,
    // yerra, tacto). Dos tablas NUEVAS y separadas a propósito: la cola de
    // caravaneo está en uso real en el campo y no se toca — un bug acá no
    // puede arrastrarse al flujo que el productor ya usa.
    this.version(3).stores({
      rodeo: 'rfid, animal_id, potrero_id, lote_id',
      trabajos: 'id, animal_id, estado, tipo',
    })
  }
}

export const mangadb = new MangaDB()
