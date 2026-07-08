import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type CategoriaAnimal = Database['public']['Enums']['categoria_animal']

// ===== Agrupación por semana (registro de "qué se hizo/cargó") =====

export type SemanaGrupo<T> = { key: string; label: string; items: T[] }

/** Lunes 00:00 de la semana de `d` (local). */
function inicioSemana(d: Date): Date {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lunes
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}

function labelSemana(mondayISO: string): string {
  const monday = new Date(mondayISO)
  const estaSemana = inicioSemana(new Date())
  const diffSem = Math.round(
    (estaSemana.getTime() - monday.getTime()) / (7 * 86_400_000),
  )
  if (diffSem <= 0) return 'Esta semana'
  if (diffSem === 1) return 'Semana pasada'
  const dd = String(monday.getDate()).padStart(2, '0')
  const mm = String(monday.getMonth() + 1).padStart(2, '0')
  return `Semana del ${dd}/${mm}`
}

/** Agrupa por semana (lunes), semanas más recientes primero. */
export function agruparPorSemana<T>(
  items: T[],
  fecha: (t: T) => string,
): SemanaGrupo<T>[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const d = new Date(fecha(it))
    if (Number.isNaN(d.getTime())) continue
    const key = inicioSemana(d).toISOString().slice(0, 10)
    const arr = map.get(key)
    if (arr) arr.push(it)
    else map.set(key, [it])
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, label: labelSemana(key), items }))
}

// ===== Manga: caravaneos recientes =====

export type MangaHist = {
  id: string
  rfid: string
  visual: string | null
  categoria: CategoriaAnimal | null
  cargadoEn: string
}

export async function fetchHistorialManga(limit = 80): Promise<MangaHist[]> {
  const { data, error } = await supabase
    .from('caravana')
    .select('id, numero_rfid, numero_visual, created_at, animal:animal_id(categoria)')
    .eq('vigente', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({
    id: c.id,
    rfid: c.numero_rfid,
    visual: c.numero_visual,
    categoria: c.animal?.categoria ?? null,
    cargadoEn: c.created_at,
  }))
}

// ===== Recorrida: recorridas recientes con conteo de potreros =====

export type RecorridaHist = {
  id: string
  campo: string | null
  fecha: string
  cargadoEn: string
  potreros: number
  alertas: number
}

export async function fetchHistorialRecorridas(limit = 40): Promise<RecorridaHist[]> {
  const { data, error } = await supabase
    .from('recorrida')
    .select('id, fecha, created_at, campo:campo_id(nombre)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  const recs = data ?? []
  if (recs.length === 0) return []

  // Observaciones de esas recorridas → conteo de potreros y de alertas
  // (pasto pelado / agua seca / boyero cortado / en tratamiento).
  const { data: obs, error: eObs } = await supabase
    .from('observacion_potrero')
    .select('recorrida_id, pasto, agua, electrico, en_tratamiento')
    .in(
      'recorrida_id',
      recs.map((r) => r.id),
    )
  if (eObs) throw new Error(eObs.message)

  const conteo = new Map<string, { potreros: number; alertas: number }>()
  for (const o of obs ?? []) {
    const c = conteo.get(o.recorrida_id) ?? { potreros: 0, alertas: 0 }
    c.potreros += 1
    if (
      o.pasto === 'pelado' ||
      o.agua === 'seca' ||
      o.electrico === 'cortado' ||
      o.en_tratamiento
    ) {
      c.alertas += 1
    }
    conteo.set(o.recorrida_id, c)
  }

  return recs.map((r) => ({
    id: r.id,
    campo: r.campo?.nombre ?? null,
    fecha: r.fecha,
    cargadoEn: r.created_at,
    potreros: conteo.get(r.id)?.potreros ?? 0,
    alertas: conteo.get(r.id)?.alertas ?? 0,
  }))
}
