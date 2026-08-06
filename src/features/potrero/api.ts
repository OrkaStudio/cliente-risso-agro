import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
type TipoCampo = Database['public']['Enums']['tipo_campo']
type Destino = Database['public']['Enums']['destino_campania']
type Aprovechamiento = Database['public']['Enums']['aprovechamiento_forraje']

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
  destino: Destino | null
  aprovechamiento: Aprovechamiento | null
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
          'id, nombre, estado_ciclo, hectareas, cultivo, variedad, fecha_siembra, fecha_cosecha_estimada, destino, aprovechamiento, campo:campo(id, nombre, tipo)',
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
    destino: potrero.destino,
    aprovechamiento: potrero.aprovechamiento,
    ingresos,
    gastos,
    resultado,
  }
}


// ===== Labores agrícolas =====

export type LaborRow = {
  id: string
  tipo: Database['public']['Enums']['tipo_labor']
  fecha: string
  nota: string | null
  cultivo: string | null
  kgCosechados: number | null
  monto: number | null
}

/** Las labores de un potrero, de la más nueva a la más vieja. */
export async function listarLabores(potreroId: string): Promise<LaborRow[]> {
  const { data, error } = await supabase
    .from('labor_potrero')
    .select('id, tipo, fecha, nota, cultivo, kg_cosechados, movimiento:movimiento_id(monto)')
    .eq('potrero_id', potreroId)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({
    id: l.id,
    tipo: l.tipo,
    fecha: l.fecha,
    nota: l.nota,
    cultivo: l.cultivo,
    kgCosechados: l.kg_cosechados,
    monto: l.movimiento?.monto ?? null,
  }))
}

/**
 * Registra una labor. Va por RPC y no por insert directo porque son hasta tres
 * escrituras que tienen que pasar juntas: la labor, el gasto (si hay monto) y
 * el estado del ciclo del potrero.
 */
export async function registrarLabor(input: {
  empresaId: string
  potreroId: string
  tipo: Database['public']['Enums']['tipo_labor']
  fecha: string
  nota: string | null
  cultivo: string | null
  kg: number | null
  monto: number | null
  categoriaId: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_labor', {
    p_empresa_id: input.empresaId,
    p_potrero_id: input.potreroId,
    p_tipo: input.tipo,
    p_fecha: input.fecha,
    // Los tipos generados usan `undefined` para los parámetros con default,
    // no `null`: mandar null explícito no compila.
    p_nota: input.nota ?? undefined,
    p_cultivo: input.cultivo ?? undefined,
    p_kg: input.kg ?? undefined,
    p_monto: input.monto ?? undefined,
    p_categoria_id: input.categoriaId ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as string
}
