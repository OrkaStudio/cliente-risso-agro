import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type CategoriaAnimal = Database['public']['Enums']['categoria_animal']
type SexoAnimal = Database['public']['Enums']['sexo_animal']

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
    .select('id, nombre')
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
  sexo: SexoAnimal
  potreroId?: string | null
  origen?: string
  fechaNacimiento?: string | null
}

/**
 * Alta de animal con caravana MANUAL (Bluetooth diferido).
 *
 * Sin servidor no hay transacción multi-tabla nativa; el par crítico
 * (animal + caravana) se hace con pre-check de RFID + compensación si la
 * caravana falla. El evento 'alta' es best-effort (arranca el historial).
 * Hardening pendiente para multi-usuario: mover esto a una RPC transaccional
 * `crear_animal` (ver CLAUDE.md del repo).
 */
export async function crearAnimal(input: NuevoAnimal): Promise<string> {
  const rfid = input.numeroRfid.trim()

  // Pre-check: RFID único en la empresa (buena UX + evita orphan).
  const { data: existente, error: checkErr } = await supabase
    .from('caravana')
    .select('id')
    .eq('numero_rfid', rfid)
    .maybeSingle()
  if (checkErr) throw checkErr
  if (existente) throw new Error(`La caravana ${rfid} ya está registrada.`)

  // 1) animal
  const { data: animal, error: animalErr } = await supabase
    .from('animal')
    .insert({
      empresa_id: input.empresaId,
      categoria: input.categoria,
      sexo: input.sexo,
      potrero_id: input.potreroId || null,
      origen: input.origen?.trim() || null,
      fecha_nacimiento: input.fechaNacimiento || null,
    })
    .select('id')
    .single()
  if (animalErr) throw animalErr

  // 2) caravana (crítico): si falla, compensar borrando el animal.
  const { error: caravanaErr } = await supabase.from('caravana').insert({
    empresa_id: input.empresaId,
    animal_id: animal.id,
    numero_rfid: rfid,
    numero_visual: input.numeroVisual?.trim() || null,
    vigente: true,
  })
  if (caravanaErr) {
    await supabase.from('animal').delete().eq('id', animal.id)
    throw caravanaErr
  }

  // 3) evento 'alta' (best-effort).
  await supabase.from('evento').insert({
    empresa_id: input.empresaId,
    animal_id: animal.id,
    tipo: 'alta',
    datos: { caravana: rfid },
  })

  return animal.id
}
