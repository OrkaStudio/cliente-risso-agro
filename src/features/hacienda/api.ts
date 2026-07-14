import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type CategoriaAnimal = Database['public']['Enums']['categoria_animal']

export type AnimalConCaravana =
  Database['public']['Views']['v_animal_con_caravana']['Row']
export type Evento = Database['public']['Tables']['evento']['Row']

export async function listAnimales(): Promise<AnimalConCaravana[]> {
  const { data, error } = await supabase
    .from('v_animal_con_caravana')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getAnimal(id: string): Promise<AnimalConCaravana | null> {
  const { data, error } = await supabase
    .from('v_animal_con_caravana')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Evento del historial con la nota de voz ya firmada (si tiene). */
export type EventoConAudio = Evento & { audioFirmado: string | null }

export async function getEventos(animalId: string): Promise<EventoConAudio[]> {
  const { data, error } = await supabase
    .from('evento')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  // Notas de voz (manga): firmar en lote desde el bucket privado.
  const paths = (data ?? [])
    .map((e) => e.audio_url)
    .filter((p): p is string => !!p)
  const firmadas = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await supabase.storage
      .from('comprobantes')
      .createSignedUrls(paths, 3600)
    for (const u of urls ?? [])
      if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl)
  }
  return (data ?? []).map((e) => ({
    ...e,
    audioFirmado: e.audio_url ? (firmadas.get(e.audio_url) ?? null) : null,
  }))
}

/**
 * Eventos que alimentan las señales del rodeo (tacto/sanidad/pesaje/parto),
 * de TODOS los animales de la empresa (la RLS acota). Livianito: 4 columnas.
 */
export async function listEventosSenales() {
  const { data, error } = await supabase
    .from('evento')
    .select('animal_id, tipo, fecha, datos')
    .in('tipo', ['tacto', 'sanidad', 'pesaje', 'parto'])
    .order('fecha', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data ?? []
}

/** Nombre de la tropa (lote) de un animal, para la ficha. */
export async function getLote(id: string) {
  const { data, error } = await supabase
    .from('lote')
    .select('id, nombre, proposito')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listPotreros() {
  const { data, error } = await supabase
    .from('potrero')
    .select('id, nombre, campo_id')
    .order('nombre')
  if (error) throw error
  return data
}

export type StockPotrero = { potrero_id: string | null; nombre: string; cabezas: number }

export async function getStockPorPotrero(): Promise<StockPotrero[]> {
  const [{ data: stock, error: e1 }, { data: potreros, error: e2 }] =
    await Promise.all([
      supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
      supabase.from('potrero').select('id, nombre'),
    ])
  if (e1) throw e1
  if (e2) throw e2
  const nombres = new Map((potreros ?? []).map((p) => [p.id, p.nombre]))
  return (stock ?? []).map((s) => ({
    potrero_id: s.potrero_id,
    nombre: s.potrero_id ? (nombres.get(s.potrero_id) ?? '—') : 'Sin potrero',
    cabezas: s.cabezas ?? 0,
  }))
}

export type NuevoAnimal = {
  empresaId: string
  numeroRfid: string
  numeroVisual?: string
  categoria: CategoriaAnimal
  // sexo NO se carga: lo deriva Postgres desde la categoría (columna generada).
  potreroId?: string | null
  origen?: string
  fechaNacimiento?: string | null
}

/**
 * Alta de animal con caravana MANUAL (Bluetooth diferido).
 * Usa la RPC transaccional `crear_animal` (animal + caravana + evento 'alta'
 * en una sola transacción atómica). Devuelve el id del animal.
 */
export async function crearAnimal(input: NuevoAnimal): Promise<string> {
  const { data, error } = await supabase.rpc('crear_animal', {
    p_empresa_id: input.empresaId,
    p_categoria: input.categoria,
    p_numero_rfid: input.numeroRfid.trim(),
    p_numero_visual: input.numeroVisual?.trim() || undefined,
    p_potrero_id: input.potreroId || undefined,
    p_origen: input.origen?.trim() || undefined,
    p_fecha_nacimiento: input.fechaNacimiento || undefined,
  })
  if (error) throw new Error(error.message)
  return data
}

/** Una fila de la carga: categoría + cuántas cabezas de esa categoría. */
export type ItemCargaMasiva = { categoria: CategoriaAnimal; cantidad: number }

/** Un destino de la carga: un potrero del campo con sus categorías/cantidades.
 *  `potreroId: null` = sin asignar (los animales quedan sin potrero). */
export type BloqueCarga = {
  potreroId: string | null
  items: ItemCargaMasiva[]
}

export type CargaMasiva = {
  empresaId: string
  /** El lote pertenece a este campo (puede estar en varios de sus potreros). */
  campoId?: string | null
  /** Si se da un nombre de lote, se crea la tropa y se le asignan los animales. */
  loteNombre?: string
  loteProposito?: string
  origen?: string
  /** Uno o más potreros con sus cantidades (el mismo lote repartido). */
  bloques: BloqueCarga[]
}

/**
 * Carga masiva por lote SIN caravana, repartida en uno o más potreros del
 * campo, en UNA sola transacción (RPC `crear_lote_repartido`): crea el lote en
 * el campo, lo registra en cada potrero (`lote_potrero`, M:N) y crea los
 * animales distribuidos (el sexo lo deriva Postgres). Atómico: o todo, o nada.
 * Devuelve cuántos animales se crearon. Se caravanean después en la manga.
 */
export async function crearAnimalesMasivo(input: CargaMasiva): Promise<number> {
  // Un bloque por potrero; items sin cantidad se descartan. Los bloques con
  // potrero pero sin animales igual registran el potrero del lote (unificados).
  const bloques = input.bloques.map((b) => ({
    potrero_id: b.potreroId ?? null,
    items: b.items.filter((it) => it.cantidad > 0),
  }))
  const totalItems = bloques.reduce(
    (s, b) => s + b.items.reduce((x, it) => x + it.cantidad, 0),
    0,
  )
  if (totalItems === 0) throw new Error('No hay cantidades para cargar')

  const { data, error } = await supabase.rpc('crear_lote_repartido', {
    p_empresa_id: input.empresaId,
    p_campo_id: input.campoId || undefined,
    p_lote_nombre: input.loteNombre?.trim() || undefined,
    p_lote_proposito: input.loteProposito?.trim() || undefined,
    p_origen: input.origen?.trim() || undefined,
    p_bloques: bloques,
  })
  if (error) throw new Error(error.message)
  const res = data as { lote_id: string | null; total: number }
  return res.total
}

/** Una tropa presente en un potrero, con su composición. `loteId: null` agrupa
 *  los animales sueltos (sin tropa). `sinCaravana` permite avisar en la UI
 *  cuando un movimiento por cantidad va a tocar animales identificados. */
export type TropaDelPotrero = {
  loteId: string | null
  nombre: string | null
  proposito: string | null
  cabezas: number
  composicion: { categoria: CategoriaAnimal; cabezas: number; sinCaravana: number }[]
}

/** Tropas (y sueltos) que ocupan un potrero, derivadas de los animales activos. */
export async function getTropasDelPotrero(
  potreroId: string,
): Promise<TropaDelPotrero[]> {
  const { data: animales, error } = await supabase
    .from('v_animal_con_caravana')
    .select('lote_id, categoria, caravana_rfid')
    .eq('potrero_id', potreroId)
    .eq('estado', 'activo')
  if (error) throw new Error(error.message)

  const porLote = new Map<
    string | null,
    Map<CategoriaAnimal, { cabezas: number; sinCaravana: number }>
  >()
  for (const a of animales ?? []) {
    if (!a.categoria) continue
    const cats = porLote.get(a.lote_id) ?? new Map()
    const c = cats.get(a.categoria) ?? { cabezas: 0, sinCaravana: 0 }
    c.cabezas += 1
    if (!a.caravana_rfid) c.sinCaravana += 1
    cats.set(a.categoria, c)
    porLote.set(a.lote_id, cats)
  }

  const loteIds = [...porLote.keys()].filter((k): k is string => k !== null)
  const nombres = new Map<string, { nombre: string; proposito: string | null }>()
  if (loteIds.length > 0) {
    const { data: lotes, error: eL } = await supabase
      .from('lote')
      .select('id, nombre, proposito')
      .in('id', loteIds)
    if (eL) throw new Error(eL.message)
    for (const l of lotes ?? []) nombres.set(l.id, l)
  }

  return [...porLote.entries()]
    .map(([loteId, cats]) => ({
      loteId,
      nombre: loteId ? (nombres.get(loteId)?.nombre ?? '—') : null,
      proposito: loteId ? (nombres.get(loteId)?.proposito ?? null) : null,
      cabezas: [...cats.values()].reduce((s, c) => s + c.cabezas, 0),
      composicion: [...cats.entries()].map(([categoria, c]) => ({
        categoria,
        cabezas: c.cabezas,
        sinCaravana: c.sinCaravana,
      })),
    }))
    .sort((a, b) => (a.nombre ?? 'zzz').localeCompare(b.nombre ?? 'zzz'))
}

/** Tropas de un campo (para elegir tropa destino al mover). */
export async function listTropasCampo(campoId: string) {
  const { data, error } = await supabase
    .from('lote')
    .select('id, nombre, proposito')
    .eq('campo_id', campoId)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data ?? []
}

export type MoverAnimalesInput = {
  empresaId: string
  potreroOrigenId: string
  potreroDestinoId: string
  /** Tropa de origen (null = animales sueltos). */
  loteId: string | null
  /** Qué se mueve: la tropa entera del potrero, o cantidades por categoría. */
  seleccion: { todo: true } | { items: ItemCargaMasiva[] }
  /** A qué tropa llegan. Omitido = conservan la de origen (cruzar de campo
   *  conservando tropa solo vale si se muda entera; lo valida Postgres). */
  destino?: { loteId: string } | { nuevoNombre: string }
}

export type MoverAnimalesResult = {
  movidos: number
  loteDestinoId: string | null
  tropaMudada: boolean
}

/**
 * Mover animales entre potreros (y campos) en UNA transacción (RPC
 * `mover_animales`): update de potrero/tropa + un evento 'movimiento' por
 * animal + `lote_potrero` coherente. Al mover por cantidad elige primero los
 * SIN caravana. Atómico: o todo, o nada.
 */
export async function moverAnimales(
  input: MoverAnimalesInput,
): Promise<MoverAnimalesResult> {
  const { data, error } = await supabase.rpc('mover_animales', {
    p_empresa_id: input.empresaId,
    p_potrero_destino: input.potreroDestinoId,
    p_potrero_origen: input.potreroOrigenId,
    p_lote_id: input.loteId ?? undefined,
    ...('todo' in input.seleccion
      ? { p_todo: true }
      : { p_items: input.seleccion.items.filter((it) => it.cantidad > 0) }),
    ...(input.destino && 'loteId' in input.destino
      ? { p_lote_destino: input.destino.loteId }
      : {}),
    ...(input.destino && 'nuevoNombre' in input.destino
      ? { p_lote_nuevo: input.destino.nuevoNombre.trim() }
      : {}),
  })
  if (error) throw new Error(error.message)
  const res = data as {
    movidos: number
    lote_destino_id: string | null
    tropa_mudada: boolean
  }
  return {
    movidos: res.movidos,
    loteDestinoId: res.lote_destino_id,
    tropaMudada: res.tropa_mudada,
  }
}

/** Cambiar la caravana conservando la identidad del animal (RPC transaccional). */
export async function cambiarCaravana(input: {
  animalId: string
  nuevoRfid: string
  nuevaVisual?: string
  motivo?: string
}): Promise<void> {
  const { error } = await supabase.rpc('cambiar_caravana', {
    p_animal_id: input.animalId,
    p_nuevo_rfid: input.nuevoRfid.trim(),
    p_nueva_visual: input.nuevaVisual?.trim() || undefined,
    p_motivo: input.motivo?.trim() || undefined,
  })
  if (error) throw new Error(error.message)
}

/** Dar de baja (vendido/muerto) + dejar el evento en el historial (RPC). */
export async function darBaja(input: {
  animalId: string
  estado: 'vendido' | 'muerto'
  motivo?: string
  fecha?: string
}): Promise<void> {
  const { error } = await supabase.rpc('dar_baja_animal', {
    p_animal_id: input.animalId,
    p_estado: input.estado,
    p_motivo: input.motivo?.trim() || undefined,
    p_fecha: input.fecha || undefined,
  })
  if (error) throw new Error(error.message)
}

/** Tipos de evento que se cargan a mano (alta/baja/cambio_caravana son automáticos). */
export const TIPOS_EVENTO_MANUAL = [
  'sanidad',
  'parto',
  'pesaje',
  'servicio',
  'tacto',
  'destete',
  'castracion',
  'movimiento',
  'nota',
] as const
export type TipoEventoManual = (typeof TIPOS_EVENTO_MANUAL)[number]

/** Registrar un evento en el historial append-only del animal (insert directo).
 *  `datos` lleva el detalle estructurado según el tipo (ver senales.ts):
 *  pesaje {kg} · tacto {resultado, meses} · sanidad {tratamiento, retiro_hasta}. */
export async function registrarEvento(input: {
  empresaId: string
  animalId: string
  tipo: TipoEventoManual
  fecha: string
  nota?: string
  datos?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('evento').insert({
    empresa_id: input.empresaId,
    animal_id: input.animalId,
    tipo: input.tipo,
    fecha: input.fecha,
    nota: input.nota?.trim() || null,
    datos: (input.datos ?? {}) as Database['public']['Tables']['evento']['Insert']['datos'],
  })
  if (error) throw new Error(error.message)
}
