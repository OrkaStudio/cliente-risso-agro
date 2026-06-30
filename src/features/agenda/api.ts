import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type EstadoMov = Database['public']['Enums']['estado_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']

/**
 * Un ítem de la Agenda = un movimiento que cae en el calendario por su fecha:
 * pendiente (por vencimiento) o ya liquidado (por fecha de cobro/pago). El medio
 * de pago es un atributo (el "cheque" es solo `medio = cheque`).
 */
export type Vencimiento = {
  id: string
  tipo: TipoMov
  estado: EstadoMov
  monto: number
  fechaVencimiento: string | null
  fechaCobroPago: string | null
  medio: MedioPago | null
  esEcheq: boolean
  chequeNumero: string | null
  chequeBanco: string | null
  contraparte: string | null
  descripcion: string | null
  categoria: string | null
  campoId: string | null
  campo: string | null
  serieId: string | null
}

const MEDIO_LABEL: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}
export function medioLabel(m: MedioPago | null, esEcheq = false): string {
  if (m === 'cheque' && esEcheq) return 'Echeq'
  return m ? MEDIO_LABEL[m] : '—'
}

/**
 * Todos los cobros/pagos que tienen lugar en la agenda: los **pendientes** (con
 * vencimiento) y los **liquidados** (con fecha de cobro/pago). Excluye anulados.
 * Scope por RLS de la empresa.
 */
export async function listVencimientos(): Promise<Vencimiento[]> {
  const { data, error } = await supabase
    .from('movimiento_financiero')
    .select(
      'id, tipo, estado, monto, fecha_vencimiento, fecha_cobro_pago, medio_pago, es_echeq, cheque_numero, cheque_banco, contraparte, descripcion, serie_id, campo_id, categoria:categoria_movimiento(nombre), campo(nombre)',
    )
    .neq('estado', 'anulado')
    .or('fecha_vencimiento.not.is.null,fecha_cobro_pago.not.is.null')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    estado: m.estado,
    monto: Number(m.monto),
    fechaVencimiento: m.fecha_vencimiento,
    fechaCobroPago: m.fecha_cobro_pago,
    medio: m.medio_pago,
    esEcheq: m.es_echeq,
    chequeNumero: m.cheque_numero,
    chequeBanco: m.cheque_banco,
    contraparte: m.contraparte,
    descripcion: m.descripcion,
    categoria: (m.categoria as { nombre: string } | null)?.nombre ?? null,
    campoId: m.campo_id,
    campo: (m.campo as { nombre: string } | null)?.nombre ?? null,
    serieId: m.serie_id,
  }))
}

/** Marca un movimiento como cobrado/pagado: setea la fecha y pasa a liquidado. */
export async function liquidarMovimiento(id: string, fecha: string): Promise<void> {
  const { error } = await supabase
    .from('movimiento_financiero')
    .update({ fecha_cobro_pago: fecha, estado: 'liquidado' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Deshace la liquidación: vuelve a pendiente (sin fecha de cobro/pago). */
export async function revertirLiquidacion(id: string): Promise<void> {
  const { error } = await supabase
    .from('movimiento_financiero')
    .update({ fecha_cobro_pago: null, estado: 'pendiente' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
