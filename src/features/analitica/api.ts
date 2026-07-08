import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
type ActividadMov = Database['public']['Enums']['actividad_movimiento']
export type ComprobanteTipo = Database['public']['Enums']['comprobante_fiscal_tipo']

/** Línea de IVA discriminado (una por base imponible + alícuota). */
export type IvaLinea = {
  concepto: string | null
  neto: number
  alicuota: number
  iva: number
}
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
  // Fiscal / comprobante
  cuit?: string | null
  comprobanteTipo?: ComprobanteTipo | null
  ivaLineas?: IvaLinea[]
  /** Imagen del comprobante (JPEG ya achicado) a adjuntar en Storage. */
  comprobanteImg?: Blob | null
}

/** Sube la imagen del comprobante al bucket privado (RLS por empresa). */
async function subirComprobante(
  empresaId: string,
  movimientoId: string,
  img: Blob,
): Promise<string> {
  const path = `${empresaId}/${movimientoId}.jpg`
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(path, img, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(error.message)
  return path
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
  // id de cliente: lo necesitamos para el path de la imagen y las líneas de IVA.
  const id = crypto.randomUUID()

  const lineas = (input.ivaLineas ?? []).filter((l) => l.neto || l.iva)
  const netoTotal = lineas.reduce((s, l) => s + (l.neto || 0), 0)
  const ivaTotal = lineas.reduce((s, l) => s + (l.iva || 0), 0)

  // La imagen sube ANTES del insert para setear comprobante_url de una.
  let comprobanteUrl: string | null = null
  if (input.comprobanteImg) {
    comprobanteUrl = await subirComprobante(input.empresaId, id, input.comprobanteImg)
  }

  const { error } = await supabase.from('movimiento_financiero').insert({
    id,
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
    cuit_contraparte: input.cuit?.trim() || null,
    comprobante_tipo: input.comprobanteTipo ?? null,
    comprobante_url: comprobanteUrl,
    neto_total: lineas.length ? netoTotal : null,
    iva_total: lineas.length ? ivaTotal : null,
  })
  if (error) throw new Error(error.message)

  if (lineas.length) {
    const { error: eLineas } = await supabase.from('movimiento_iva_linea').insert(
      lineas.map((l, i) => ({
        empresa_id: input.empresaId,
        movimiento_id: id,
        concepto: l.concepto?.trim() || null,
        neto: l.neto || 0,
        alicuota: l.alicuota,
        iva: l.iva || 0,
        orden: i,
      })),
    )
    if (eLineas) throw new Error(eLineas.message)
  }
}
