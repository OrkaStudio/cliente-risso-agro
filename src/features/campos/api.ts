import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoCampo = Database['public']['Enums']['tipo_campo']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
export type Campo = Database['public']['Tables']['campo']['Row']
export type Potrero = Database['public']['Tables']['potrero']['Row']

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
