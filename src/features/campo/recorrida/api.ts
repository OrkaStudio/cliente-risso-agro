import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type PastoEstado = Database['public']['Enums']['pasto_estado']
export type AguaEstado = Database['public']['Enums']['agua_estado']
export type ElectricoEstado = Database['public']['Enums']['electrico_estado']
export type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
export type CultivoEstado = Database['public']['Enums']['cultivo_obs_estado']
export type CategoriaAnimal = Database['public']['Enums']['categoria_animal']

/** Una categoría presente en el potrero y cuántas cabezas. Cacheado offline
 *  para mostrar la composición al tocar un potrero en el croquis, sin señal. */
export type CompoItem = { categoria: CategoriaAnimal; cabezas: number }

/** Una TROPA (lote) presente en el potrero, con su composición — para elegir a
 *  qué tropa entra un nacimiento sin señal (auto si es una sola, elegir con
 *  composición si hay varias). Solo tropas CON animales en el potrero. */
export type TropaRec = {
  id: string
  nombre: string
  cabezas: number
  composicion: CompoItem[]
}

export type CampoRec = {
  id: string
  nombre: string
  empresa_id: string
  /** Índice de color/letra estable (por orden de creación). Ver colorDeCampo. */
  color_idx: number
}
/** [lat, lng] — mismo formato que potrero.poligono (JSONB). */
export type LatLng = [number, number]
/** Última observación conocida del potrero (para "igual que la última vez"). */
export type UltimaObs = {
  fecha: string
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
  cultivo: CultivoEstado | null
}

export type PotreroRec = {
  id: string
  nombre: string
  estado_ciclo: EstadoCiclo
  cabezas: number
  /** Composición por categoría (de la última sincronización con señal). */
  composicion: CompoItem[]
  /** Tropas con animales en el potrero (para asignar un nacimiento offline). */
  tropas: TropaRec[]
  /** Polígono del potrero (si se dibujó en Oficina) — alimenta el croquis. */
  poligono: LatLng[] | null
  /** Última observación registrada (de cualquier recorrida anterior). */
  ultima: UltimaObs | null
}

export type Observacion = {
  potrero_id: string
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
  cultivo: CultivoEstado | null
  /** Path en storage de la nota de voz (null = sin audio / borrar). */
  audio_url: string | null
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Días desde la última observación de un potrero. null = nunca se recorrió. */
export function diasDesde(fecha: string | undefined | null): number | null {
  if (!fecha) return null
  const d = Date.parse(`${fecha}T00:00:00`)
  if (Number.isNaN(d)) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((hoy.getTime() - d) / 86_400_000))
}

/** Texto humano de antigüedad para el panel de atrasados. */
export function haceCuantoTxt(dias: number | null): string {
  if (dias == null) return 'nunca'
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/**
 * Campos + potreros (con stock esperado) de TODA la empresa, para cachear en
 * Dexie: la recorrida se puede ARRANCAR sin señal usando este cache.
 */
export async function fetchRefs(): Promise<{
  campos: CampoRec[]
  potreros: (PotreroRec & { campo_id: string })[]
}> {
  const [camposRes, potrerosRes, stockRes, obsRes, animalesRes, lotesRes] =
    await Promise.all([
    // Orden por color_idx = orden de la letra (A, B, C…): la lista de campos
    // queda coherente con las letras de sus potreros en toda la app.
    supabase.from('campo').select('id, nombre, empresa_id, color_idx').order('color_idx'),
    supabase
      .from('potrero')
      .select('id, nombre, estado_ciclo, campo_id, poligono')
      .order('nombre'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    // Observaciones recientes → última por potrero ("igual que la última vez").
    supabase
      .from('observacion_potrero')
      .select(
        'potrero_id, pasto, agua, electrico, conteo, en_tratamiento, novedad, cultivo, created_at, recorrida:recorrida_id(fecha)',
      )
      .order('created_at', { ascending: false })
      .limit(1000),
    // Animales activos (potrero + categoría + tropa) → composición por potrero
    // Y por tropa, para mostrar el desglose y elegir tropa de un nacimiento SIN
    // señal al tocar un potrero en el croquis.
    supabase
      .from('v_animal_con_caravana')
      .select('potrero_id, categoria, lote_id')
      .eq('estado', 'activo'),
    // Nombres de tropas (lote) → etiquetar la selección de tropa del nacimiento.
    supabase.from('lote').select('id, nombre'),
  ])
  if (camposRes.error) throw camposRes.error
  if (potrerosRes.error) throw potrerosRes.error
  if (stockRes.error) throw stockRes.error
  if (obsRes.error) throw obsRes.error
  if (animalesRes.error) throw animalesRes.error
  if (lotesRes.error) throw lotesRes.error

  const cab = new Map(
    (stockRes.data ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]),
  )
  // Composición por potrero: categoría → cabezas, ordenada de mayor a menor.
  const composPorPotrero = new Map<string, Map<CategoriaAnimal, number>>()
  for (const a of animalesRes.data ?? []) {
    if (!a.potrero_id || !a.categoria) continue
    const m = composPorPotrero.get(a.potrero_id) ?? new Map<CategoriaAnimal, number>()
    m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1)
    composPorPotrero.set(a.potrero_id, m)
  }
  const composDe = (potreroId: string): CompoItem[] =>
    [...(composPorPotrero.get(potreroId)?.entries() ?? [])]
      .map(([categoria, cabezas]) => ({ categoria, cabezas }))
      .sort((x, y) => y.cabezas - x.cabezas)
  // Composición por (potrero, tropa): categoría → cabezas, solo tropas con
  // animales en el potrero. Alimenta la selección de tropa del nacimiento.
  const nombreLote = new Map((lotesRes.data ?? []).map((l) => [l.id, l.nombre]))
  const tropasPorPotrero = new Map<
    string,
    Map<string, Map<CategoriaAnimal, number>>
  >()
  for (const a of animalesRes.data ?? []) {
    if (!a.potrero_id || !a.categoria || !a.lote_id) continue
    const porLote =
      tropasPorPotrero.get(a.potrero_id) ??
      new Map<string, Map<CategoriaAnimal, number>>()
    const comp = porLote.get(a.lote_id) ?? new Map<CategoriaAnimal, number>()
    comp.set(a.categoria, (comp.get(a.categoria) ?? 0) + 1)
    porLote.set(a.lote_id, comp)
    tropasPorPotrero.set(a.potrero_id, porLote)
  }
  const tropasDe = (potreroId: string): TropaRec[] =>
    [...(tropasPorPotrero.get(potreroId)?.entries() ?? [])]
      .map(([loteId, comp]) => {
        const composicion = [...comp.entries()]
          .map(([categoria, cabezas]) => ({ categoria, cabezas }))
          .sort((x, y) => y.cabezas - x.cabezas)
        return {
          id: loteId,
          nombre: nombreLote.get(loteId) ?? 'Tropa',
          cabezas: composicion.reduce((s, c) => s + c.cabezas, 0),
          composicion,
        }
      })
      .sort((a, b) => b.cabezas - a.cabezas)
  // Primera aparición por potrero = la más reciente (vienen ordenadas desc).
  const ultimas = new Map<string, UltimaObs>()
  for (const o of obsRes.data ?? []) {
    if (ultimas.has(o.potrero_id)) continue
    ultimas.set(o.potrero_id, {
      fecha: o.recorrida?.fecha ?? o.created_at.slice(0, 10),
      pasto: o.pasto,
      agua: o.agua,
      electrico: o.electrico,
      conteo: o.conteo,
      en_tratamiento: o.en_tratamiento,
      novedad: o.novedad,
      cultivo: o.cultivo,
    })
  }
  return {
    campos: (camposRes.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      empresa_id: c.empresa_id,
      color_idx: c.color_idx ?? 0,
    })),
    potreros: (potrerosRes.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado_ciclo: p.estado_ciclo,
      campo_id: p.campo_id,
      cabezas: cab.get(p.id) ?? 0,
      composicion: composDe(p.id),
      tropas: tropasDe(p.id),
      poligono: (p.poligono as LatLng[] | null) ?? null,
      ultima: ultimas.get(p.id) ?? null,
    })),
  }
}

const EXT_AUDIO: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
}

/** Path de la nota de voz en el bucket privado `comprobantes` (RLS por
 *  prefijo de empresa, mismas policies que las fotos de Plata). Idempotente
 *  por (recorrida, potrero): re-grabar pisa, reintentar no duplica. */
export function pathAudio(
  empresaId: string,
  recorridaId: string,
  potreroId: string,
  mime: string,
): string {
  const ext = EXT_AUDIO[mime.split(';')[0]] ?? 'webm'
  return `${empresaId}/rec-${recorridaId}-${potreroId}.${ext}`
}

/** Sube la nota de voz. `upsert` no está permitido por las policies (solo
 *  insert): si ya existe (reintento o re-grabación), se borra… no hay delete.
 *  → El path es determinístico y el objeto existente se acepta como subido;
 *  una re-grabación DESPUÉS de sincronizar queda para Oficina (v2). */
export async function subirAudio(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false })
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
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
    cultivo: obs.cultivo,
    audio_url: obs.audio_url,
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
