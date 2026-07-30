import { supabase } from '@/lib/supabase/client'
import type { OpMovimiento, OpNacimiento } from './db'

/**
 * Sube un nacimiento: crea el/los animal/es en el potrero (sin caravana, origen
 * "nacido", categoría ternero/ternera) vía la RPC transaccional que también usa
 * la carga masiva de Oficina. El animal cae solo en la lista de "sin caravana"
 * de la Manga para caravanearlo al destete/marca.
 *
 * Tres cosas viajan además de los animales:
 *
 *  · `p_alta_id` = la clave de la cola → IDEMPOTENCIA server-side. Si el ACK se
 *    pierde a mitad de vuelo, el reintento es un no-op que devuelve el total
 *    previo en vez de crear los animales de nuevo (migración `operacion_campo`).
 *  · `p_fecha` = la fecha de la RECORRIDA, no la de la sincronización. Anotado
 *    sin señal el lunes y drenado el jueves ⇒ queda fechado el lunes, en
 *    `animal.fecha_nacimiento` y en `evento.fecha`.
 *  · `p_contexto` = de dónde salió. Sin esto un nacimiento del campo era
 *    indistinguible de una carga masiva hecha a mano en Oficina.
 */
export async function subirNacimiento(op: OpNacimiento): Promise<void> {
  const { error } = await supabase.rpc('crear_animales_masivo', {
    p_empresa_id: op.empresa_id,
    p_potrero_id: op.potrero_id,
    p_lote_id: op.lote_id ?? undefined,
    p_origen: 'nacido',
    p_items: [{ categoria: op.categoria, cantidad: op.cantidad }],
    p_alta_id: op.cliente_id,
    // Ítems encolados antes de esta versión no traen fecha: la RPC cae a
    // current_date, que es lo mismo que hacía antes.
    p_fecha: op.fecha ?? undefined,
    p_contexto: {
      tipo: 'nacimiento',
      origen_ui: 'recorrida',
      recorrida_id: op.recorrida_id ?? null,
      potrero_nombre: op.potrero_nombre,
      lote_nombre: op.lote_nombre,
      declarado_at: new Date(op.created_at).toISOString(),
    },
  })
  if (error) throw new Error(error.message)
}

/**
 * Sube un movimiento declarado en el campo: la tropa pasa de un potrero a otro.
 *
 * Va en modo `p_todo` (tropa entera) cuando se declaró así — que es el default
 * del campo y el único robusto sin señal: el server mueve LO QUE HAYA. El modo
 * por cantidad (`p_items`) levanta excepción si el número no coincide, y un
 * movimiento rechazado cuando los animales ya cruzaron el alambre deja la
 * realidad y la base divergentes.
 *
 * `p_alta_id` acá importa incluso más que en el nacimiento: reintentar un
 * movimiento no duplicaba, pero FALLABA ("No hay animales para mover", porque
 * ya se movieron) y la cola marcaba como error una operación exitosa.
 */
export async function subirMovimiento(op: OpMovimiento): Promise<void> {
  const { error } = await supabase.rpc('mover_animales', {
    p_empresa_id: op.empresa_id,
    p_potrero_destino: op.potrero_destino_id,
    p_potrero_origen: op.potrero_origen_id,
    p_lote_id: op.lote_id ?? undefined,
    ...(op.todo
      ? { p_todo: true }
      : { p_items: op.movidos.filter((m) => m.cantidad > 0) }),
    p_alta_id: op.cliente_id,
    p_fecha: op.fecha ?? undefined,
    p_contexto: {
      tipo: 'movimiento',
      origen_ui: 'recorrida',
      recorrida_id: op.recorrida_id ?? null,
      lote_nombre: op.lote_nombre,
      declarado_at: new Date(op.created_at).toISOString(),
    },
  })
  if (error) throw new Error(error.message)
}
