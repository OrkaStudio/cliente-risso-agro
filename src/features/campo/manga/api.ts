import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type CategoriaAnimal = Database['public']['Enums']['categoria_animal']

export type AnimalSinCaravana = {
  id: string
  empresa_id: string
  categoria: CategoriaAnimal
  potrero_id: string | null
  potrero_nombre: string | null
  lote_id: string | null
  lote_nombre: string | null
}

/**
 * Trae todos los animales ACTIVOS sin caravana vigente de la empresa (bajo RLS),
 * enriquecidos con el nombre de potrero y lote para el selector de alcance.
 * "Sin caravana" = no aparece en `caravana` con `vigente = true`.
 */
export async function fetchSinCaravana(): Promise<AnimalSinCaravana[]> {
  const [animalesRes, caravanasRes, potrerosRes, lotesRes] = await Promise.all([
    supabase
      .from('animal')
      .select('id, empresa_id, categoria, potrero_id, lote_id')
      .eq('estado', 'activo'),
    supabase.from('caravana').select('animal_id').eq('vigente', true),
    supabase.from('potrero').select('id, nombre'),
    supabase.from('lote').select('id, nombre'),
  ])
  if (animalesRes.error) throw animalesRes.error
  if (caravanasRes.error) throw caravanasRes.error
  if (potrerosRes.error) throw potrerosRes.error
  if (lotesRes.error) throw lotesRes.error

  const taggeados = new Set((caravanasRes.data ?? []).map((c) => c.animal_id))
  const potreros = new Map((potrerosRes.data ?? []).map((p) => [p.id, p.nombre]))
  const lotes = new Map((lotesRes.data ?? []).map((l) => [l.id, l.nombre]))

  return (animalesRes.data ?? [])
    .filter((a) => !taggeados.has(a.id))
    .map((a) => ({
      id: a.id,
      empresa_id: a.empresa_id,
      categoria: a.categoria,
      potrero_id: a.potrero_id,
      potrero_nombre: a.potrero_id ? (potreros.get(a.potrero_id) ?? null) : null,
      lote_id: a.lote_id,
      lote_nombre: a.lote_id ? (lotes.get(a.lote_id) ?? null) : null,
    }))
}

export type AsignarInput = {
  animalId: string
  rfid: string
  visual?: string | null
  categoria: CategoriaAnimal
  raza?: string | null
  pelaje?: string | null
}

/**
 * Primera asignación de caravana (RPC transaccional `asignar_caravana`):
 * caravana vigente + categoría/raza/pelaje + evento. Rechaza RFID duplicado
 * por empresa y animal que ya tenga vigente.
 */
export async function asignarCaravana(input: AsignarInput): Promise<void> {
  const { error } = await supabase.rpc('asignar_caravana', {
    p_animal_id: input.animalId,
    p_numero_rfid: input.rfid.trim(),
    p_numero_visual: input.visual?.trim() || undefined,
    p_categoria: input.categoria,
    p_raza: input.raza?.trim() || undefined,
    p_pelaje: input.pelaje?.trim() || undefined,
  })
  if (error) throw new Error(error.message)
}

/**
 * Deshacer un caravaneo ya sincronizado: borra la caravana vigente del animal
 * (vuelve a "sin caravana", libera el RFID) y deja una nota de auditoría en el
 * historial (append-only). RLS por empresa (caravana admite delete de la propia
 * empresa). Requiere señal.
 */
export async function deshacerCaravana(
  animalId: string,
  rfid: string,
): Promise<void> {
  const { error } = await supabase
    .from('caravana')
    .delete()
    .eq('animal_id', animalId)
    .eq('vigente', true)
  if (error) throw new Error(error.message)

  const { data: a } = await supabase
    .from('animal')
    .select('empresa_id')
    .eq('id', animalId)
    .maybeSingle()
  if (a) {
    await supabase.from('evento').insert({
      empresa_id: a.empresa_id,
      animal_id: animalId,
      tipo: 'nota',
      nota: `Caravaneo deshecho (RFID ${rfid})`,
    })
  }
}
