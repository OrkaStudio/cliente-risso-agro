import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type PastoEstado = Database['public']['Enums']['pasto_estado']
export type AguaEstado = Database['public']['Enums']['agua_estado']
export type ElectricoEstado = Database['public']['Enums']['electrico_estado']
export type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

export type CampoRec = { id: string; nombre: string }
export type PotreroRec = {
  id: string
  nombre: string
  estado_ciclo: EstadoCiclo
  cabezas: number
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

export async function fetchCampos(): Promise<CampoRec[]> {
  const { data, error } = await supabase
    .from('campo')
    .select('id, nombre')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

/** Potreros del campo + stock esperado (pista para el conteo). */
export async function fetchPotreros(campoId: string): Promise<PotreroRec[]> {
  const [{ data: potreros, error: e1 }, { data: stock, error: e2 }] =
    await Promise.all([
      supabase
        .from('potrero')
        .select('id, nombre, estado_ciclo')
        .eq('campo_id', campoId)
        .order('nombre'),
      supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    ])
  if (e1) throw e1
  if (e2) throw e2
  const cab = new Map((stock ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]))
  return (potreros ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    estado_ciclo: p.estado_ciclo,
    cabezas: cab.get(p.id) ?? 0,
  }))
}

/** Crea o retoma la recorrida de HOY del campo. */
export async function getOrCreateRecorridaHoy(
  campoId: string,
): Promise<{ id: string; empresa_id: string }> {
  const fecha = hoyISO()
  const { data: existente, error: e1 } = await supabase
    .from('recorrida')
    .select('id, empresa_id')
    .eq('campo_id', campoId)
    .eq('fecha', fecha)
    .maybeSingle()
  if (e1) throw e1
  if (existente) return existente

  const { data: campo, error: e2 } = await supabase
    .from('campo')
    .select('empresa_id')
    .eq('id', campoId)
    .single()
  if (e2) throw e2

  const { data, error } = await supabase
    .from('recorrida')
    .insert({ campo_id: campoId, empresa_id: campo.empresa_id, fecha })
    .select('id, empresa_id')
    .single()
  if (error) throw error
  return data
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
