import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type EstadoMov = Database['public']['Enums']['estado_movimiento']

export type Cheque = {
  id: string
  tipo: TipoMov
  esEcheq: boolean
  numero: string | null
  banco: string | null
  contraparte: string | null
  descripcion: string | null
  monto: number
  fechaVencimiento: string | null
  fechaCobroPago: string | null
  estado: EstadoMov
}

/**
 * Cheques y echeqs = movimientos con medio_pago 'cheque'. Ordenados por
 * vencimiento (los sin fecha al final). Scope por RLS de la empresa.
 */
export async function listCheques(): Promise<Cheque[]> {
  const { data, error } = await supabase
    .from('movimiento_financiero')
    .select(
      'id, tipo, es_echeq, cheque_numero, cheque_banco, contraparte, descripcion, monto, fecha_vencimiento, fecha_cobro_pago, estado',
    )
    .eq('medio_pago', 'cheque')
    .neq('estado', 'anulado')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    esEcheq: m.es_echeq,
    numero: m.cheque_numero,
    banco: m.cheque_banco,
    contraparte: m.contraparte,
    descripcion: m.descripcion,
    monto: Number(m.monto),
    fechaVencimiento: m.fecha_vencimiento,
    fechaCobroPago: m.fecha_cobro_pago,
    estado: m.estado,
  }))
}
