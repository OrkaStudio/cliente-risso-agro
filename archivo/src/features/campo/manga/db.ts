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
  /**
   * Qué hecho de la sesión es éste, único dentro de la pasada (`sanidad#0`,
   * `sanidad#1`, `destete#0`…).
   *
   * No alcanza con `tipo`: en una vacunación se aplican varias vacunas de una,
   * y son varios `sanidad` DISTINTOS sobre el mismo animal. Sin esta clave, el
   * chequeo de "ya lo hiciste" daba por cumplida la segunda vacuna apenas se
   * anotaba la primera, y el animal se iba sin la otra.
   */
  clave?: string
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

/**
 * A qué grupo del aparte fue a parar cada animal.
 *
 * Existe por dos razones que se sostienen solas. La primera es que el destino
 * tiene que EJECUTARSE: mandar la tropa al 6B es una llamada a `mover_animales`
 * con la lista de animales, y esa lista no se puede armar si nadie anotó quién
 * salió por dónde. La segunda es el conteo: un aparte suelto no genera ningún
 * `evento` —no le pasó nada al animal más que cambiar de potrero— y sin esta
 * tabla el progreso se quedaba en cero y los repetidos no se detectaban.
 *
 * Vive separada de `trabajos` porque su drenado es de otra naturaleza: los
 * trabajos suben de a uno (un `evento` por animal) y el aparte sube POR TANDA
 * (una llamada por grupo, con todos los animales juntos).
 */
export type AparteItem = {
  /** UUID de cliente. */
  id: string
  /** Sesión de trabajo: acota el conteo y el drenado a la pasada de hoy. */
  sesion_id: string
  animal_id: string
  rfid: string
  /** `salida.id` del plan. */
  salida_id: string
  /** Snapshot del nombre del grupo: el plan vive en React y muere al salir. */
  etiqueta: string
  destino_k: 'potrero' | 'venta' | 'manga' | 'queda'
  potrero_destino_id: string | null
  potrero_destino_nombre: string | null
  fecha: string
  /**
   * Lote de drenado. Todos los animales que se suben en la MISMA llamada
   * comparten `alta_id`, y por eso el reintento es inofensivo: `mover_animales`
   * devuelve el resultado guardado en vez de mover de nuevo.
   *
   * Se asigna al drenar y no antes: si se reusara el `alta_id` de una tanda
   * anterior, los animales escaneados después quedarían fuera del movimiento
   * —la RPC devolvería el resultado viejo y nadie se enteraría—.
   */
  alta_id: string | null
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
  apartes!: Table<AparteItem, string>

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
    // v4: el APARTE. Tabla nueva, aditiva: no toca `trabajos` ni `outbox`, que
    // están en uso real en el campo.
    this.version(4).stores({
      apartes: 'id, sesion_id, animal_id, estado, salida_id',
    })
  }
}

export const mangadb = new MangaDB()
