import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type PastoEstado = Database['public']['Enums']['pasto_estado']
export type AguaEstado = Database['public']['Enums']['agua_estado']
export type ElectricoEstado = Database['public']['Enums']['electrico_estado']
export type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

export type CampoRec = { id: string; nombre: string; empresa_id: string }
/** [lat, lng] — mismo formato que potrero.poligono (JSONB). */
export type LatLng = [number, number]
export type PotreroRec = {
  id: string
  nombre: string
  estado_ciclo: EstadoCiclo
  cabezas: number
  /** Polígono del potrero (si se dibujó en Oficina) — alimenta el croquis. */
  poligono: LatLng[] | null
}

export type Observacion = {
  potrero_id: string
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/**
 * Campos + potreros (con stock esperado) de TODA la empresa, para cachear en
 * Dexie: la recorrida se puede ARRANCAR sin señal usando este cache.
 */
export async function fetchRefs(): Promise<{
  campos: CampoRec[]
  potreros: (PotreroRec & { campo_id: string })[]
}> {
  const [camposRes, potrerosRes, stockRes] = await Promise.all([
    supabase.from('campo').select('id, nombre, empresa_id').order('nombre'),
    supabase
      .from('potrero')
      .select('id, nombre, estado_ciclo, campo_id, poligono')
      .order('nombre'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
  ])
  if (camposRes.error) throw camposRes.error
  if (potrerosRes.error) throw potrerosRes.error
  if (stockRes.error) throw stockRes.error

  const cab = new Map(
    (stockRes.data ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]),
  )
  return {
    campos: camposRes.data ?? [],
    potreros: (potrerosRes.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado_ciclo: p.estado_ciclo,
      campo_id: p.campo_id,
      cabezas: cab.get(p.id) ?? 0,
      poligono: (p.poligono as LatLng[] | null) ?? null,
    })),
  }
}

/**
 * Garantiza que la fila `recorrida` exista en el servidor ANTES de subir
 * observaciones (FK). La recorrida arranca local con UUID de cliente:
 *   · si el servidor ya tiene la recorrida de (campo, fecha) — otra sesión u
 *     otro dispositivo — se ADOPTA su id (el caller re-apunta las obs);
 *   · si no, se inserta con el UUID local (reintentar no duplica: el select
 *     de arriba la encuentra en el próximo intento).
 * Devuelve el id remoto vigente.
 */
export async function asegurarRecorridaRemota(meta: {
  recorrida_id: string
  campo_id: string
  empresa_id: string
  fecha: string
}): Promise<string> {
  const { data: existente, error: e1 } = await supabase
    .from('recorrida')
    .select('id')
    .eq('campo_id', meta.campo_id)
    .eq('fecha', meta.fecha)
    .maybeSingle()
  if (e1) throw new Error(e1.message)
  if (existente) return existente.id

  const { error } = await supabase.from('recorrida').insert({
    id: meta.recorrida_id,
    campo_id: meta.campo_id,
    empresa_id: meta.empresa_id,
    fecha: meta.fecha,
  })
  if (error) throw new Error(error.message)
  return meta.recorrida_id
}

/**
 * Guarda la observación de un potrero — ÚNICA por (recorrida, potrero): si ya
 * existe la pisa (upsert manual). Así el drenado es idempotente (reintentar no
 * duplica) y volver a un potrero corrige en vez de sumar.
 */
export async function guardarObservacion(input: {
  recorridaId: string
  empresaId: string
  obs: Observacion
}): Promise<void> {
  const { recorridaId, empresaId, obs } = input
  const payload = {
    empresa_id: empresaId,
    recorrida_id: recorridaId,
    potrero_id: obs.potrero_id,
    pasto: obs.pasto,
    agua: obs.agua,
    electrico: obs.electrico,
    conteo: obs.conteo,
    en_tratamiento: obs.en_tratamiento,
    novedad: obs.novedad?.trim() || null,
  }
  const { data: existente } = await supabase
    .from('observacion_potrero')
    .select('id')
    .eq('recorrida_id', recorridaId)
    .eq('potrero_id', obs.potrero_id)
    .maybeSingle()
  if (existente) {
    const { error } = await supabase
      .from('observacion_potrero')
      .update(payload)
      .eq('id', existente.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('observacion_potrero').insert(payload)
    if (error) throw new Error(error.message)
  }
}

/** Lluvia del campo (mm) del día — única por campo+fecha (upsert manual). */
export async function guardarLluvia(input: {
  campoId: string
  empresaId: string
  mm: number
}): Promise<void> {
  const fecha = hoyISO()
  const { data: ex } = await supabase
    .from('lluvia')
    .select('id')
    .eq('campo_id', input.campoId)
    .eq('fecha', fecha)
    .maybeSingle()
  if (ex) {
    const { error } = await supabase
      .from('lluvia')
      .update({ mm: input.mm })
      .eq('id', ex.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('lluvia').insert({
      campo_id: input.campoId,
      empresa_id: input.empresaId,
      fecha,
      mm: input.mm,
    })
    if (error) throw new Error(error.message)
  }
}
