import Dexie, { type Table } from 'dexie'
import type { TipoMov } from './api'

// Base local de Plata (IndexedDB vía Dexie), separada de manga y recorrida.
//   · refs:   cache de categorías y campos (para cargar sin señal). Se
//     refresca cada vez que hay señal; singleton.
//   · outbox: cola de movimientos a subir. La foto viaja como Blob dentro
//     del ítem (IndexedDB los guarda sin problema; ~200-400 KB ya achicada).

export type RefCategoria = {
  id: string
  nombre: string
  aplica_a: TipoMov | null
}

export type RefCampo = {
  id: string
  nombre: string
  empresa_id: string
}

export type PlataRefs = {
  id: 'refs'
  categorias: RefCategoria[]
  campos: RefCampo[]
  updated_at: number
}

export type EstadoPlata = 'pendiente' | 'sincronizada' | 'error'

export type PlataItem = {
  /** UUID del movimiento, generado en el cliente: reintentar el insert no
   *  duplica (conflicto de PK = ya estaba subido = éxito). */
  id: string
  empresa_id: string
  campo_id: string
  tipo: TipoMov
  monto: number
  categoria_id: string
  categoria_nombre: string
  fecha: string
  descripcion: string | null
  foto: Blob | null
  /** 1 = la foto ya quedó en Storage (para no re-subirla si el insert falló). */
  foto_subida: 0 | 1
  estado: EstadoPlata
  error: string | null
  created_at: number
}

class PlataDB extends Dexie {
  refs!: Table<PlataRefs, string>
  outbox!: Table<PlataItem, string>

  constructor() {
    super('risso-plata')
    this.version(1).stores({
      refs: 'id',
      outbox: 'id, estado, created_at',
    })
  }
}

export const platadb = new PlataDB()
