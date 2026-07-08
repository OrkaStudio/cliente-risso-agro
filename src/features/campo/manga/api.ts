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
 * Devuelve además los RFID YA en uso en la empresa: se cachean para avisar del
 * duplicado al instante (offline), no recién cuando el sync lo rechaza.
 */
export async function fetchSinCaravana(): Promise<{
  animales: AnimalSinCaravana[]
  rfidsEnUso: string[]
}> {
  const [animalesRes, caravanasRes, potrerosRes, lotesRes] = await Promise.all([
    supabase
      .from('animal')
      .select('id, empresa_id, categoria, potrero_id, lote_id')
      .eq('estado', 'activo'),
    supabase.from('caravana').select('animal_id, numero_rfid').eq('vigente', true),
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

  const animales = (animalesRes.data ?? [])
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
  const rfidsEnUso = (caravanasRes.data ?? []).map((c) =>
    c.numero_rfid.trim().toLowerCase(),
  )
  return { animales, rfidsEnUso }
}

export type AsignarInput = {
  animalId: string
  rfid: string
  visual?: string | null
  categoria: CategoriaAnimal
  nota?: string | null
  /** Path en storage de la nota de voz (ya subida) — evento.audio_url. */
  audioUrl?: string | null
}

const EXT_AUDIO: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
}

/** Path de la nota de voz del animal en el bucket privado `comprobantes`
 *  (RLS por prefijo de empresa). El uuid es de cliente: reintentar no
 *  duplica (el objeto existente se acepta como subido). */
export function pathAudioEvento(
  empresaId: string,
  audioId: string,
  mime: string,
): string {
  const ext = EXT_AUDIO[mime.split(';')[0]] ?? 'webm'
  return `${empresaId}/evento-${audioId}.${ext}`
}

export async function subirAudioEvento(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false })
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
  }
}

/**
 * Primera asignación de caravana (RPC transaccional `asignar_caravana`):
 * caravana vigente + categoría + evento. Rechaza RFID duplicado por empresa y
 * animal que ya tenga vigente. Si hay nota, se agrega como evento `nota` del
 * animal (best-effort, tras la asignación: no rompe el caravaneo si falla).
 */
export async function asignarCaravana(input: AsignarInput): Promise<void> {
  const { error } = await supabase.rpc('asignar_caravana', {
    p_animal_id: input.animalId,
    p_numero_rfid: input.rfid.trim(),
    p_numero_visual: input.visual?.trim() || undefined,
    p_categoria: input.categoria,
  })
  if (error) throw new Error(error.message)

  const nota = input.nota?.trim()
  if (nota || input.audioUrl) {
    try {
      const { data: a } = await supabase
        .from('animal')
        .select('empresa_id')
        .eq('id', input.animalId)
        .maybeSingle()
      if (a) {
        await supabase.from('evento').insert({
          empresa_id: a.empresa_id,
          animal_id: input.animalId,
          tipo: 'nota',
          nota: nota || null,
          audio_url: input.audioUrl ?? null,
        })
      }
    } catch {
      /* la nota es best-effort; el caravaneo ya quedó */
    }
  }
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
