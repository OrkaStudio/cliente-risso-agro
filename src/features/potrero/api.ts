import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
type TipoCampo = Database['public']['Enums']['tipo_campo']

export type AnimalEnPotrero = {
  id: string
  caravana: string
  categoria: Categoria
  fechaNacimiento: string | null
}

export type PotreroDetalle = {
  id: string
  nombre: string
  estadoCiclo: EstadoCiclo
  hectareas: number | null
  campoId: string
  campoNombre: string
  campoTipo: TipoCampo
  totalCabezas: number
  porCategoria: { categoria: Categoria; cabezas: number }[]
  animales: AnimalEnPotrero[]
  /** Campaña agrícola actual (carga manual). */
  cultivo: string | null
  variedad: string | null
  fechaSiembra: string | null
  fechaCosechaEstimada: string | null
  /** Plata devengada del potrero (suma de todos los meses). */
  ingresos: number
  gastos: number
  resultado: number
}

/**
 * Detalle de un potrero: su campo, su hacienda activa (stock por categoría +
 * listado) y su plata devengada. Todo scopeado por la RLS de la empresa.
 */
export async function getPotreroDetalle(
  id: string,
): Promise<PotreroDetalle | null> {
  const [{ data: potrero, error: ePot }, { data: animales, error: eAni }, { data: rent, error: eRent }] =
    await Promise.all([
      supabase
        .from('potrero')
        .select(
          'id, nombre, estado_ciclo, hectareas, cultivo, variedad, fecha_siembra, fecha_cosecha_estimada, campo:campo(id, nombre, tipo)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('v_animal_con_caravana')
        .select('id, categoria, caravana_rfid, caravana_visual, fecha_nacimiento')
        .eq('potrero_id', id)
        .eq('estado', 'activo'),
      supabase
        .from('v_rentabilidad_devengada')
        .select('ingresos, gastos, resultado')
        .eq('potrero_id', id),
    ])
  if (ePot) throw new Error(ePot.message)
  if (eAni) throw new Error(eAni.message)
  if (eRent) throw new Error(eRent.message)
  if (!potrero) return null

  const campo = potrero.campo as {
    id: string
    nombre: string
    tipo: TipoCampo
  } | null

  // Stock por categoría
  const catMap = new Map<Categoria, number>()
  for (const a of animales ?? []) {
    if (!a.categoria) continue
    catMap.set(a.categoria, (catMap.get(a.categoria) ?? 0) + 1)
  }
  const porCategoria = [...catMap.entries()]
    .map(([categoria, cabezas]) => ({ categoria, cabezas }))
    .sort((x, y) => y.cabezas - x.cabezas)

  const lista: AnimalEnPotrero[] = (animales ?? []).map((a) => ({
    id: a.id ?? crypto.randomUUID(),
    caravana: a.caravana_visual ?? a.caravana_rfid ?? '—',
    categoria: a.categoria as Categoria,
    fechaNacimiento: a.fecha_nacimiento,
  }))

  const ingresos = (rent ?? []).reduce((s, r) => s + (r.ingresos ?? 0), 0)
  const gastos = (rent ?? []).reduce((s, r) => s + (r.gastos ?? 0), 0)
  const resultado = (rent ?? []).reduce((s, r) => s + (r.resultado ?? 0), 0)

  return {
    id: potrero.id,
    nombre: potrero.nombre,
    estadoCiclo: potrero.estado_ciclo,
    hectareas: potrero.hectareas,
    campoId: campo?.id ?? '—',
    campoNombre: campo?.nombre ?? '—',
    campoTipo: campo?.tipo ?? 'propio',
    totalCabezas: lista.length,
    porCategoria,
    animales: lista,
    cultivo: potrero.cultivo,
    variedad: potrero.variedad,
    fechaSiembra: potrero.fecha_siembra,
    fechaCosechaEstimada: potrero.fecha_cosecha_estimada,
    ingresos,
    gastos,
    resultado,
  }
}

/** Actualiza la campaña agrícola del potrero (carga manual). */
export async function actualizarCultivo(input: {
  id: string
  cultivo: string | null
  variedad: string | null
  fechaSiembra: string | null
  fechaCosechaEstimada: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('potrero')
    .update({
      cultivo: input.cultivo,
      variedad: input.variedad,
      fecha_siembra: input.fechaSiembra,
      fecha_cosecha_estimada: input.fechaCosechaEstimada,
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
}
