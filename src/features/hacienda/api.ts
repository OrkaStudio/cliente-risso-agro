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

export async function getEventos(animalId: string): Promise<Evento[]> {
  const { data, error } = await supabase
    .from('evento')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
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

/** Registrar un evento en el historial append-only del animal (insert directo). */
export async function registrarEvento(input: {
  empresaId: string
  animalId: string
  tipo: TipoEventoManual
  fecha: string
  nota?: string
}): Promise<void> {
  const { error } = await supabase.from('evento').insert({
    empresa_id: input.empresaId,
    animal_id: input.animalId,
    tipo: input.tipo,
    fecha: input.fecha,
    nota: input.nota?.trim() || null,
  })
  if (error) throw new Error(error.message)
}
