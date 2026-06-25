import { supabase } from '@/lib/supabase/client'
import type {
  Database,
  TablesInsert,
  TablesUpdate,
} from '@/lib/supabase/types'
import type { PotreroCardData } from '@/features/potrero/potrero-card'

type TipoCampo = Database['public']['Enums']['tipo_campo']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
type Categoria = Database['public']['Enums']['categoria_animal']
export type Campo = Database['public']['Tables']['campo']['Row']
export type Potrero = Database['public']['Tables']['potrero']['Row']
export type Infraestructura =
  Database['public']['Tables']['infraestructura']['Row']
export type TipoInfraestructura =
  Database['public']['Enums']['tipo_infraestructura']
export type Lote = Database['public']['Tables']['lote']['Row']
/** Anillo geográfico como array de [lat, lng] (columna jsonb). */
export type LatLng = [number, number]

export type CampoConPotreros = {
  id: string
  nombre: string
  tipo: TipoCampo
  hectareas: number | null
  potreros: PotreroCardData[]
  totalCabezas: number
  /** Superficie sumada de los potreros (ha). */
  totalHa: number
}

/**
 * Campos con sus potreros enriquecidos (cabezas + composición por categoría
 * + campaña agrícola). Para el rediseño de la sección Campos.
 */
export async function listCamposConPotreros(): Promise<CampoConPotreros[]> {
  const [
    { data: campos, error: eC },
    { data: potreros, error: eP },
    { data: stock, error: eS },
    { data: animales, error: eA },
  ] = await Promise.all([
    supabase.from('campo').select('id, nombre, tipo, hectareas').order('nombre'),
    supabase
      .from('potrero')
      .select(
        'id, nombre, campo_id, estado_ciclo, hectareas, cultivo, fecha_siembra, fecha_cosecha_estimada, destino',
      )
      .order('nombre'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    supabase
      .from('v_animal_con_caravana')
      .select('categoria, potrero_id, estado')
      .eq('estado', 'activo'),
  ])
  if (eC) throw new Error(eC.message)
  if (eP) throw new Error(eP.message)
  if (eS) throw new Error(eS.message)
  if (eA) throw new Error(eA.message)

  const cab = new Map((stock ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]))
  const catPorPotrero = new Map<string, Map<Categoria, number>>()
  for (const a of animales ?? []) {
    if (!a.categoria || !a.potrero_id) continue
    const m = catPorPotrero.get(a.potrero_id) ?? new Map<Categoria, number>()
    m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1)
    catPorPotrero.set(a.potrero_id, m)
  }

  const potrerosPorCampo = new Map<string, PotreroCardData[]>()
  for (const p of potreros ?? []) {
    const composicion = [...(catPorPotrero.get(p.id)?.entries() ?? [])]
      .map(([categoria, cabezas]) => ({ categoria, cabezas }))
      .sort((x, y) => y.cabezas - x.cabezas)
    const vista: PotreroCardData = {
      id: p.id,
      nombre: p.nombre,
      estadoCiclo: p.estado_ciclo,
      hectareas: p.hectareas,
      cabezas: cab.get(p.id) ?? 0,
      porCategoria: composicion,
      cultivo: p.cultivo,
      fechaSiembra: p.fecha_siembra,
      fechaCosechaEstimada: p.fecha_cosecha_estimada,
      destino: p.destino,
    }
    const arr = potrerosPorCampo.get(p.campo_id) ?? []
    arr.push(vista)
    potrerosPorCampo.set(p.campo_id, arr)
  }

  return (campos ?? []).map((c) => {
    const ps = (potrerosPorCampo.get(c.id) ?? []).sort(
      (a, b) => b.cabezas - a.cabezas,
    )
    return {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      hectareas: c.hectareas,
      potreros: ps,
      totalCabezas: ps.reduce((s, p) => s + p.cabezas, 0),
      totalHa: ps.reduce((s, p) => s + (p.hectareas ?? 0), 0),
    }
  })
}

/** Campos de la empresa con el conteo de potreros de cada uno. */
export async function listCampos() {
  const { data, error } = await supabase
    .from('campo')
    .select('*, potrero(count)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}

export async function getCampo(id: string): Promise<Campo | null> {
  const { data, error } = await supabase
    .from('campo')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function crearCampo(input: {
  empresaId: string
  nombre: string
  tipo: TipoCampo
  hectareas?: number | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('campo')
    .insert({
      empresa_id: input.empresaId,
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      hectareas: input.hectareas ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function actualizarCampo(input: {
  id: string
  nombre: string
  tipo: TipoCampo
  hectareas?: number | null
}): Promise<void> {
  const { error } = await supabase
    .from('campo')
    .update({
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      hectareas: input.hectareas ?? null,
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
}

export async function listPotreros(campoId: string): Promise<Potrero[]> {
  const { data, error } = await supabase
    .from('potrero')
    .select('*')
    .eq('campo_id', campoId)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}

export async function crearPotrero(input: {
  empresaId: string
  campoId: string
  nombre: string
  estadoCiclo: EstadoCiclo
  hectareas?: number | null
}): Promise<void> {
  const { error } = await supabase.from('potrero').insert({
    empresa_id: input.empresaId,
    campo_id: input.campoId,
    nombre: input.nombre.trim(),
    estado_ciclo: input.estadoCiclo,
    hectareas: input.hectareas ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarPotrero(input: {
  id: string
  nombre: string
  estadoCiclo: EstadoCiclo
  hectareas?: number | null
}): Promise<void> {
  const { error } = await supabase
    .from('potrero')
    .update({
      nombre: input.nombre.trim(),
      estado_ciclo: input.estadoCiclo,
      hectareas: input.hectareas ?? null,
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
}

// ===== Datos del mapa de un campo (geometría + uso + stock) =====

export type PotreroMapa = {
  id: string
  nombre: string
  poligono: LatLng[] | null
  estadoCiclo: EstadoCiclo
  hectareas: number | null
  cultivo: string | null
  cabezas: number
}

export type CampoMapa = {
  id: string
  nombre: string
  tipo: TipoCampo
  contorno: LatLng[] | null
  potreros: PotreroMapa[]
}

/** Todo lo que la vista satelital necesita de un campo, desde la base real. */
export async function getCampoMapa(campoId: string): Promise<CampoMapa | null> {
  const [{ data: campo, error: eC }, { data: pots, error: eP }, { data: stock, error: eS }] =
    await Promise.all([
      supabase
        .from('campo')
        .select('id, nombre, tipo, contorno')
        .eq('id', campoId)
        .maybeSingle(),
      supabase
        .from('potrero')
        .select('id, nombre, poligono, estado_ciclo, hectareas, cultivo')
        .eq('campo_id', campoId)
        .order('nombre'),
      supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    ])
  if (eC) throw new Error(eC.message)
  if (eP) throw new Error(eP.message)
  if (eS) throw new Error(eS.message)
  if (!campo) return null

  const cab = new Map((stock ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]))
  return {
    id: campo.id,
    nombre: campo.nombre,
    tipo: campo.tipo,
    contorno: (campo.contorno as LatLng[] | null) ?? null,
    potreros: (pots ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      poligono: (p.poligono as LatLng[] | null) ?? null,
      estadoCiclo: p.estado_ciclo,
      hectareas: p.hectareas,
      cultivo: p.cultivo,
      cabezas: cab.get(p.id) ?? 0,
    })),
  }
}

// ===== Geometría (jsonb de [lat,lng]) =====

export async function setCampoContorno(
  campoId: string,
  contorno: LatLng[] | null,
): Promise<void> {
  const { error } = await supabase
    .from('campo')
    .update({ contorno })
    .eq('id', campoId)
  if (error) throw new Error(error.message)
}

export async function setPotreroPoligono(
  potreroId: string,
  poligono: LatLng[] | null,
): Promise<void> {
  const { error } = await supabase
    .from('potrero')
    .update({ poligono })
    .eq('id', potreroId)
  if (error) throw new Error(error.message)
}

// ===== Infraestructura (molino / laguna / tranquera / manga) =====

export async function listInfraestructura(
  campoId: string,
): Promise<Infraestructura[]> {
  const { data, error } = await supabase
    .from('infraestructura')
    .select('*')
    .eq('campo_id', campoId)
  if (error) throw new Error(error.message)
  return data
}

export async function crearInfraestructura(
  input: TablesInsert<'infraestructura'>,
): Promise<Infraestructura> {
  const { data, error } = await supabase
    .from('infraestructura')
    .insert(input)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function actualizarInfraestructura(
  id: string,
  patch: TablesUpdate<'infraestructura'>,
): Promise<void> {
  const { error } = await supabase
    .from('infraestructura')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarInfraestructura(id: string): Promise<void> {
  const { error } = await supabase.from('infraestructura').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ===== Lotes (tropa dentro de un potrero) =====

export async function listLotes(campoId: string): Promise<Lote[]> {
  const { data, error } = await supabase
    .from('lote')
    .select('*, potrero!inner(campo_id)')
    .eq('potrero.campo_id', campoId)
  if (error) throw new Error(error.message)
  // Quitar el join anidado (solo se usó para filtrar por campo).
  return (data ?? []).map(({ potrero: _p, ...lote }) => lote as Lote)
}

export async function crearLote(input: TablesInsert<'lote'>): Promise<Lote> {
  const { data, error } = await supabase
    .from('lote')
    .insert(input)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function actualizarLote(
  id: string,
  patch: TablesUpdate<'lote'>,
): Promise<void> {
  const { error } = await supabase.from('lote').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarLote(id: string): Promise<void> {
  const { error } = await supabase.from('lote').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Asigna (o desasigna con loteId=null) un conjunto de animales a un lote. */
export async function asignarAnimalesALote(
  loteId: string | null,
  animalIds: string[],
): Promise<void> {
  if (animalIds.length === 0) return
  const { error } = await supabase
    .from('animal')
    .update({ lote_id: loteId })
    .in('id', animalIds)
  if (error) throw new Error(error.message)
}
