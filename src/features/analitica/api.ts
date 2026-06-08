import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
export type CategoriaMov = Database['public']['Tables']['categoria_movimiento']['Row']

export type MovimientoConDetalle =
  Database['public']['Tables']['movimiento_financiero']['Row'] & {
    categoria: { nombre: string; grupo: string } | null
    campo: { nombre: string } | null
    potrero: { nombre: string } | null
  }

/** Categorías visibles (globales + propias) activas. */
export async function listCategorias(): Promise<CategoriaMov[]> {
  const { data, error } = await supabase
    .from('categoria_movimiento')
    .select('*')
    .eq('activo', true)
    .order('grupo')
  if (error) throw new Error(error.message)
  return data
}

export async function listMovimientos(): Promise<MovimientoConDetalle[]> {
  const { data, error } = await supabase
    .from('movimiento_financiero')
    .select(
      '*, categoria:categoria_movimiento(nombre, grupo), campo(nombre), potrero(nombre)',
    )
    .order('fecha_devengo', { ascending: false })
  if (error) throw new Error(error.message)
  return data as unknown as MovimientoConDetalle[]
}

export type NuevoMovimiento = {
  empresaId: string
  tipo: TipoMov
  categoriaId: string
  campoId: string
  potreroId?: string | null
  monto: number
  fechaDevengo: string
  fechaCobroPago?: string | null
  medioPago?: MedioPago | null
  descripcion?: string
}

export async function crearMovimiento(input: NuevoMovimiento): Promise<void> {
  // estado derivado: si tiene fecha de cobro/pago, ya pasó por caja → liquidado.
  const liquidado = !!input.fechaCobroPago
  const { error } = await supabase.from('movimiento_financiero').insert({
    empresa_id: input.empresaId,
    tipo: input.tipo,
    categoria_id: input.categoriaId,
    campo_id: input.campoId,
    potrero_id: input.potreroId || null,
    monto: input.monto,
    fecha_devengo: input.fechaDevengo,
    fecha_cobro_pago: input.fechaCobroPago || null,
    medio_pago: input.medioPago || null,
    descripcion: input.descripcion?.trim() || null,
    estado: liquidado ? 'liquidado' : 'pendiente',
  })
  if (error) throw new Error(error.message)
}
