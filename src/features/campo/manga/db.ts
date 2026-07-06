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
  estado: EstadoOutbox
  error: string | null
  created_at: number
}

class MangaDB extends Dexie {
  animales!: Table<AnimalCache, string>
  outbox!: Table<OutboxItem, number>
  refs!: Table<RfidsCache, string>

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
  }
}

export const mangadb = new MangaDB()
