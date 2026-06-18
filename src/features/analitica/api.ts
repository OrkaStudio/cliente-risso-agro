import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
type ActividadMov = Database['public']['Enums']['actividad_movimiento']
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

export type Pendiente = {
  id: string
  campoId: string | null
  descripcion: string
  tipo: TipoMov | null
  monto: number | null
  fechaVencimiento: string | null
  diasParaVencer: number | null
}

/** Cobros y pagos pendientes (vista v_pendientes), por urgencia. */
export async function listPendientes(): Promise<Pendiente[]> {
  const { data, error } = await supabase
    .from('v_pendientes')
    .select('id, campo_id, descripcion, tipo, monto, fecha_vencimiento, dias_para_vencer')
    .order('dias_para_vencer', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((v) => ({
    id: v.id ?? crypto.randomUUID(),
    campoId: v.campo_id,
    descripcion: v.descripcion ?? '—',
    tipo: v.tipo,
    monto: v.monto,
    fechaVencimiento: v.fecha_vencimiento,
    diasParaVencer: v.dias_para_vencer,
  }))
}

export type NuevoMovimiento = {
  empresaId: string
  tipo: TipoMov
  categoriaId: string
  campoId: string
  potreroId?: string | null
  monto: number
  fechaDevengo: string
  fechaVencimiento?: string | null
  fechaCobroPago?: string | null
  medioPago?: MedioPago | null
  actividad?: ActividadMov | null
  descripcion?: string
  // Cheque / echeq (solo cuando medioPago === 'cheque')
  esEcheq?: boolean
  chequeNumero?: string | null
  chequeBanco?: string | null
  contraparte?: string | null
}

// ===== Series: gastos recurrentes / en cuotas =====
export type Frecuencia =
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual'

const MESES_FREQ: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

export const frecuenciaLabel: Record<Frecuencia, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

function addMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export type NuevaSerie = {
  empresaId: string
  tipo: TipoMov
  categoriaId: string
  campoId: string
  potreroId?: string | null
  actividad?: ActividadMov | null
  montoCuota: number
  frecuencia: Frecuencia
  primeraFecha: string
  cantidad: number
  descripcion: string
  medioPago?: MedioPago | null
}

/** Genera la serie completa de cuotas pendientes, unidas por serie_id. */
export async function crearSerie(input: NuevaSerie): Promise<void> {
  const serieId = crypto.randomUUID()
  const off = MESES_FREQ[input.frecuencia]
  const filas = Array.from({ length: input.cantidad }, (_, i) => {
    const fecha = addMeses(input.primeraFecha, i * off)
    return {
      empresa_id: input.empresaId,
      tipo: input.tipo,
      categoria_id: input.categoriaId,
      campo_id: input.campoId,
      potrero_id: input.potreroId || null,
      actividad: input.actividad || null,
      monto: input.montoCuota,
      fecha_devengo: fecha,
      fecha_vencimiento: fecha,
      fecha_cobro_pago: null,
      estado: 'pendiente' as const,
      medio_pago: input.medioPago || null,
      descripcion: `${input.descripcion.trim()} (cuota ${i + 1}/${input.cantidad})`,
      serie_id: serieId,
    }
  })
  const { error } = await supabase.from('movimiento_financiero').insert(filas)
  if (error) throw new Error(error.message)
}

/** Cancela (anula) las cuotas pendientes de una serie. Las pagadas quedan. */
export async function cancelarSerie(serieId: string): Promise<void> {
  const { error } = await supabase
    .from('movimiento_financiero')
    .update({ estado: 'anulado' })
    .eq('serie_id', serieId)
    .eq('estado', 'pendiente')
  if (error) throw new Error(error.message)
}

export async function crearMovimiento(input: NuevoMovimiento): Promise<void> {
  // estado derivado: si tiene fecha de cobro/pago, ya pasó por caja → liquidado.
  const liquidado = !!input.fechaCobroPago
  const esCheque = input.medioPago === 'cheque'
  const { error } = await supabase.from('movimiento_financiero').insert({
    empresa_id: input.empresaId,
    tipo: input.tipo,
    categoria_id: input.categoriaId,
    campo_id: input.campoId,
    potrero_id: input.potreroId || null,
    monto: input.monto,
    fecha_devengo: input.fechaDevengo,
    fecha_vencimiento: input.fechaVencimiento || null,
    fecha_cobro_pago: input.fechaCobroPago || null,
    medio_pago: input.medioPago || null,
    actividad: input.actividad || null,
    descripcion: input.descripcion?.trim() || null,
    estado: liquidado ? 'liquidado' : 'pendiente',
    es_echeq: esCheque ? !!input.esEcheq : false,
    cheque_numero: esCheque ? input.chequeNumero?.trim() || null : null,
    cheque_banco: esCheque ? input.chequeBanco?.trim() || null : null,
    contraparte: input.contraparte?.trim() || null,
  })
  if (error) throw new Error(error.message)
}
