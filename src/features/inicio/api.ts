import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
type TipoCampo = Database['public']['Enums']['tipo_campo']

export type CategoriaConteo = { categoria: Categoria; cabezas: number }

export type PotreroPanorama = {
  id: string
  nombre: string
  campoId: string
  campoNombre: string
  campoTipo: TipoCampo
  estadoCiclo: EstadoCiclo
  hectareas: number | null
  cabezas: number
  /** Composición de la hacienda del potrero, por categoría (desc). */
  porCategoria: CategoriaConteo[]
  /** Campaña agrícola actual (carga manual). null si no aplica. */
  cultivo: string | null
  fechaSiembra: string | null
  fechaCosechaEstimada: string | null
  destino: Database['public']['Enums']['destino_campania'] | null
}

export type Vencimiento = {
  id: string
  descripcion: string
  tipo: Database['public']['Enums']['tipo_movimiento'] | null
  monto: number | null
  fechaVencimiento: string | null
  diasParaVencer: number | null
}

export type PanoramaInicio = {
  totalCabezas: number
  porCategoria: CategoriaConteo[]
  potreros: PotreroPanorama[]
  /** Neto del flujo de caja del año (suma de v_flujo_caja). */
  netoAnual: number
  /** Pendientes de pago/cobro próximos, ordenados por urgencia. */
  vencimientos: Vencimiento[]
  porPagarTotal: number
}

/**
 * Una sola lectura agregada para el dashboard de Inicio. Junta hacienda
 * (stock por categoría), campos (potreros con estado y carga) y plata
 * (flujo de caja + pendientes) desde vistas ya existentes en Postgres.
 */
export async function getPanoramaInicio(): Promise<PanoramaInicio> {
  const [
    { data: animales, error: eAni },
    { data: potreros, error: ePot },
    { data: stock, error: eStock },
    { data: flujo, error: eFlujo },
    { data: pendientes, error: ePend },
  ] = await Promise.all([
    supabase
      .from('v_animal_con_caravana')
      .select('categoria, estado, potrero_id')
      .eq('estado', 'activo'),
    supabase
      .from('potrero')
      .select(
        'id, nombre, estado_ciclo, hectareas, cultivo, fecha_siembra, fecha_cosecha_estimada, destino, campo:campo(id, nombre, tipo)',
      )
      .order('nombre'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    supabase.from('v_flujo_caja').select('neto'),
    supabase
      .from('v_pendientes')
      .select('id, descripcion, tipo, monto, fecha_vencimiento, dias_para_vencer')
      .order('dias_para_vencer', { ascending: true }),
  ])
  if (eAni) throw new Error(eAni.message)
  if (ePot) throw new Error(ePot.message)
  if (eStock) throw new Error(eStock.message)
  if (eFlujo) throw new Error(eFlujo.message)
  if (ePend) throw new Error(ePend.message)

  // Stock por categoría
  const catMap = new Map<Categoria, number>()
  for (const a of animales ?? []) {
    if (!a.categoria) continue
    catMap.set(a.categoria, (catMap.get(a.categoria) ?? 0) + 1)
  }
  const porCategoria: CategoriaConteo[] = [...catMap.entries()]
    .map(([categoria, cabezas]) => ({ categoria, cabezas }))
    .sort((a, b) => b.cabezas - a.cabezas)
  const totalCabezas = porCategoria.reduce((s, c) => s + c.cabezas, 0)

  // Composición por potrero: categoría → cabezas
  const catPorPotrero = new Map<string, Map<Categoria, number>>()
  for (const a of animales ?? []) {
    if (!a.categoria || !a.potrero_id) continue
    const m = catPorPotrero.get(a.potrero_id) ?? new Map<Categoria, number>()
    m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1)
    catPorPotrero.set(a.potrero_id, m)
  }

  // Cabezas por potrero
  const cab = new Map(
    (stock ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]),
  )
  const potrerosPanorama: PotreroPanorama[] = (potreros ?? []).map((p) => {
    const campo = p.campo as {
      id: string
      nombre: string
      tipo: TipoCampo
    } | null
    const composicion: CategoriaConteo[] = [
      ...(catPorPotrero.get(p.id)?.entries() ?? []),
    ]
      .map(([categoria, cabezas]) => ({ categoria, cabezas }))
      .sort((a, b) => b.cabezas - a.cabezas)
    return {
      id: p.id,
      nombre: p.nombre,
      campoId: campo?.id ?? '—',
      campoNombre: campo?.nombre ?? '—',
      campoTipo: campo?.tipo ?? 'propio',
      estadoCiclo: p.estado_ciclo,
      hectareas: p.hectareas,
      cabezas: cab.get(p.id) ?? 0,
      porCategoria: composicion,
      cultivo: p.cultivo,
      fechaSiembra: p.fecha_siembra,
      fechaCosechaEstimada: p.fecha_cosecha_estimada,
      destino: p.destino,
    }
  })

  // Plata
  const netoAnual = (flujo ?? []).reduce((s, f) => s + (f.neto ?? 0), 0)
  const vencimientos: Vencimiento[] = (pendientes ?? []).map((v) => ({
    id: v.id ?? crypto.randomUUID(),
    descripcion: v.descripcion ?? '—',
    tipo: v.tipo,
    monto: v.monto,
    fechaVencimiento: v.fecha_vencimiento,
    diasParaVencer: v.dias_para_vencer,
  }))
  const porPagarTotal = vencimientos
    .filter((v) => v.tipo === 'gasto')
    .reduce((s, v) => s + (v.monto ?? 0), 0)

  return {
    totalCabezas,
    porCategoria,
    potreros: potrerosPanorama,
    netoAnual,
    vencimientos,
    porPagarTotal,
  }
}
