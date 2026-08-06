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

/**
 * El nombre de una semana.
 *
 * `diffSem <= 0` devolvía "Esta semana" para TODAS las semanas futuras: un plan
 * de 12 cuotas mensuales generaba doce grupos distintos rotulados todos igual.
 * El futuro se rotula con su fecha, y con año cuando no es el corriente —una
 * cuota de febrero del año que viene no es "Semana del 01/02" a secas—.
 */
function labelSemana(mondayISO: string): string {
  const monday = new Date(`${mondayISO}T00:00:00`)
  const estaSemana = inicioSemana(new Date())
  const diffSem = Math.round(
    (estaSemana.getTime() - monday.getTime()) / (7 * 86_400_000),
  )
  if (diffSem === 0) return 'Esta semana'
  if (diffSem === 1) return 'Semana pasada'
  const dd = String(monday.getDate()).padStart(2, '0')
  const mm = String(monday.getMonth() + 1).padStart(2, '0')
  const anio =
    monday.getFullYear() === new Date().getFullYear()
      ? ''
      : `/${monday.getFullYear()}`
  return `Semana del ${dd}/${mm}${anio}`
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

// ===== Manga: TRABAJOS, agrupados por lo que se hizo =====

/**
 * Una pasada de manga, no un animal.
 *
 * El historial listaba una fila por caravana: con 200 cabezas eran 200 filas
 * iguales y ninguna respondía la pregunta real, que es **qué se hizo, cuándo y
 * a cuántos**. Acá cada fila es un trabajo.
 *
 * El agrupado es por `datos.sesion_id` cuando está (lo escribe la manga desde
 * TASK-053) y cae a fecha+tipo cuando no — los eventos anteriores no lo tienen
 * y no se puede reconstruir hacia atrás.
 */
export type TrabajoHist = {
  id: string
  /** Cómo lo llama el productor: Vacunación, Destete, Tacto, Aparte… */
  actividad: string
  tipo: string
  fecha: string
  cargadoEn: string
  animales: number
  /** Una línea con lo propio del trabajo (qué vacuna, cómo dio el tacto). */
  detalle: string | null
}

/** Nombre de la actividad para cada `tipo_evento` que produce la manga. */
const ACTIVIDAD: Record<string, string> = {
  sanidad: 'Vacunación',
  destete: 'Destete',
  castracion: 'Yerra',
  tacto: 'Tacto',
  movimiento: 'Aparte',
  caravana_asignada: 'Caravaneo',
}

const TIPOS_MANGA = [
  'sanidad',
  'destete',
  'castracion',
  'tacto',
  'movimiento',
  'caravana_asignada',
]

type FilaEvento = {
  id: string
  tipo: string
  fecha: string
  animal_id: string | null
  created_at: string
  datos: Record<string, unknown> | null
}

/** Lo que distingue a un trabajo de otro dentro del mismo día. */
function detalleDe(tipo: string, filas: FilaEvento[]): string | null {
  const valores = (k: string) =>
    [...new Set(filas.map((f) => f.datos?.[k]).filter(Boolean))].map(String)

  if (tipo === 'sanidad') {
    const t = valores('tratamiento')
    return t.length ? t.join(' + ') : null
  }
  if (tipo === 'tacto') {
    const pre = filas.filter((f) => f.datos?.resultado === 'prenada').length
    const vac = filas.filter((f) => f.datos?.resultado === 'vacia').length
    if (!pre && !vac) return null
    return `${pre} preñadas · ${vac} vacías`
  }
  if (tipo === 'movimiento') {
    const g = valores('grupo')
    return g.length ? g.join(' · ') : null
  }
  return null
}

/**
 * Los trabajos de manga de la empresa (RLS filtra sola), agrupados.
 *
 * `caravana_asignada` no lleva `origen_ui` —lo escribe la RPC del servidor— así
 * que se lo trae aparte en vez de perderlo.
 */
export async function fetchHistorialTrabajos(limit = 600): Promise<TrabajoHist[]> {
  const [deManga, caravaneos] = await Promise.all([
    supabase
      .from('evento')
      .select('id, tipo, fecha, animal_id, created_at, datos')
      .eq('datos->>origen_ui', 'manga')
      .order('fecha', { ascending: false })
      .limit(limit),
    supabase
      .from('evento')
      .select('id, tipo, fecha, animal_id, created_at, datos')
      .eq('tipo', 'caravana_asignada')
      .order('fecha', { ascending: false })
      .limit(limit),
  ])
  if (deManga.error) throw new Error(deManga.error.message)
  if (caravaneos.error) throw new Error(caravaneos.error.message)

  const vistos = new Set<string>()
  const filas: FilaEvento[] = []
  for (const f of [...(deManga.data ?? []), ...(caravaneos.data ?? [])]) {
    if (vistos.has(f.id)) continue
    vistos.add(f.id)
    if (TIPOS_MANGA.includes(f.tipo)) filas.push(f as FilaEvento)
  }

  const grupos = new Map<string, FilaEvento[]>()
  for (const f of filas) {
    const sesion = f.datos?.sesion_id
    const clave = `${f.fecha}|${f.tipo}|${typeof sesion === 'string' ? sesion : ''}`
    const arr = grupos.get(clave)
    if (arr) arr.push(f)
    else grupos.set(clave, [f])
  }

  return [...grupos.entries()]
    .map(([clave, fs]) => ({
      id: clave,
      actividad: ACTIVIDAD[fs[0].tipo] ?? fs[0].tipo,
      tipo: fs[0].tipo,
      fecha: fs[0].fecha,
      // El más reciente de la tanda: es cuando se terminó de subir.
      cargadoEn: fs.map((f) => f.created_at).sort().at(-1) ?? fs[0].created_at,
      animales: new Set(fs.map((f) => f.animal_id).filter(Boolean)).size,
      detalle: detalleDe(fs[0].tipo, fs),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// ===== Manga: caravaneos recientes (detalle por animal) =====

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
  /** Índice de color del campo: su identidad visual, la misma del croquis y
   *  del mapa de Oficina. Dos recorridas de campos distintos tienen que
   *  distinguirse sin leer el nombre. */
  colorIdx: number
  fecha: string
  cargadoEn: string
  potreros: number
  alertas: number
  /** Milímetros anotados ese día en ese campo (si se cargaron). */
  lluviaMm: number | null
}

export async function fetchHistorialRecorridas(limit = 40): Promise<RecorridaHist[]> {
  const { data, error } = await supabase
    .from('recorrida')
    .select('id, fecha, created_at, campo_id, campo:campo_id(nombre, color_idx)')
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

  // La lluvia del día se anota por campo, no por recorrida: se cruza por
  // (campo, fecha), que es como la carga el productor al cerrar.
  const { data: lluvias } = await supabase
    .from('lluvia')
    .select('campo_id, fecha, mm')
    .in('campo_id', [...new Set(recs.map((r) => r.campo_id).filter(Boolean))])
  const porCampoFecha = new Map<string, number>()
  for (const l of lluvias ?? []) {
    if (l.mm != null) porCampoFecha.set(`${l.campo_id}|${l.fecha}`, l.mm)
  }

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
    colorIdx: r.campo?.color_idx ?? 0,
    fecha: r.fecha,
    cargadoEn: r.created_at,
    potreros: conteo.get(r.id)?.potreros ?? 0,
    alertas: conteo.get(r.id)?.alertas ?? 0,
    lluviaMm: porCampoFecha.get(`${r.campo_id}|${r.fecha}`) ?? null,
  }))
}

// ===== Detalle de una recorrida (para el pop-up) =====

export type ObsDetalle = {
  potrero: string | null
  pasto: string | null
  agua: string | null
  electrico: string | null
  cultivo: string | null
  conteo: number | null
  enTratamiento: boolean
  novedad: string | null
  /** URL firmada de la nota de voz (si hay). */
  audioUrl: string | null
}

export async function fetchRecorridaDetalle(recorridaId: string): Promise<ObsDetalle[]> {
  const { data, error } = await supabase
    .from('observacion_potrero')
    .select(
      'pasto, agua, electrico, cultivo, conteo, en_tratamiento, novedad, audio_url, potrero:potrero_id(nombre)',
    )
    .eq('recorrida_id', recorridaId)
  if (error) throw new Error(error.message)
  const obs = data ?? []

  // Firmamos los audios en lote.
  const paths = obs.map((o) => o.audio_url).filter((p): p is string => !!p)
  const firmadas = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await supabase.storage
      .from('comprobantes')
      .createSignedUrls(paths, 3600)
    for (const u of urls ?? []) if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl)
  }

  return obs.map((o) => ({
    potrero: o.potrero?.nombre ?? null,
    pasto: o.pasto,
    agua: o.agua,
    electrico: o.electrico,
    cultivo: o.cultivo,
    conteo: o.conteo,
    enTratamiento: o.en_tratamiento,
    novedad: o.novedad,
    audioUrl: o.audio_url ? (firmadas.get(o.audio_url) ?? null) : null,
  }))
}
