import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { errorDeBase } from '@/lib/error-de-base'
import { todasLasFilas } from '@/lib/todas-las-filas'

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
  if (error) throw errorDeBase(error)
  return data
}

export async function listMovimientos(): Promise<MovimientoConDetalle[]> {
  // Todos, de a tandas: con más de 1000 se cortaba en silencio (lista y totales de Plata).
  const data = await todasLasFilas((desde, hasta) =>
    supabase
      .from('movimiento_financiero')
      .select(
        '*, categoria:categoria_movimiento(nombre, grupo), campo(nombre), potrero(nombre)',
      )
      // Lo anulado no es un movimiento: no se lista ni suma.
      .neq('estado', 'anulado')
      .order('fecha_devengo', { ascending: false })
      .order('id')
      .range(desde, hasta),
  )
  return data as unknown as MovimientoConDetalle[]
}

/** Lo que cargó otro deja de ser «Nuevo» (permisos, entrega 4). */
export async function marcarRevisados(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('movimiento_financiero').update({ revisado_at: new Date().toISOString() }).in('id', ids)
  if (error) throw errorDeBase(error)
}

/** Deshacer «Está bien»: vuelve a estar para revisar (y quien lo cargó puede volver a corregirlo). */
export async function desmarcarRevisados(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('movimiento_financiero').update({ revisado_at: null }).in('id', ids)
  if (error) throw errorDeBase(error)
}

/**
 * Corregir un movimiento (Lau, 24/11): si salió o entró, en qué, de qué campo, cuánto, el
 * detalle y la fecha. Queda revisado. La fecha mueve también la de pago, que es la que
 * ordena Plata y Movimientos (antes cambiaba sólo la del registro y seguía en el mes viejo).
 */
export async function corregirMovimiento(x: { id: string; tipo: TipoMov; categoriaId: string; campoId: string; monto: number; descripcion: string; fecha: string; pagado: boolean }): Promise<void> {
  const { error } = await supabase
    .from('movimiento_financiero')
    .update({
      tipo: x.tipo,
      categoria_id: x.categoriaId,
      campo_id: x.campoId,
      monto: x.monto,
      descripcion: x.descripcion,
      fecha_devengo: x.fecha,
      ...(x.pagado ? { fecha_cobro_pago: x.fecha } : {}),
      revisado_at: new Date().toISOString(),
    })
    .eq('id', x.id)
  if (error) throw errorDeBase(error)
}

/** Anular un movimiento: deja de contar, pero queda el rastro (no se borra). */
export async function anularMovimiento(id: string): Promise<void> {
  const { error } = await supabase.from('movimiento_financiero').update({ estado: 'anulado', revisado_at: new Date().toISOString() }).eq('id', id)
  if (error) throw errorDeBase(error)
}

/** Cuántos movimientos cargados por otros todavía no se miraron (el número junto a Plata). */
export async function contarNuevos(): Promise<number> {
  const { count, error } = await supabase.from('movimiento_financiero').select('id', { count: 'exact', head: true }).is('revisado_at', null).neq('estado', 'anulado')
  if (error) throw errorDeBase(error)
  return count ?? 0
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
  const data = await todasLasFilas((desde, hasta) =>
    supabase
      .from('v_pendientes')
      .select('id, campo_id, descripcion, tipo, monto, fecha_vencimiento, dias_para_vencer')
      .order('dias_para_vencer', { ascending: true })
      .order('id')
      .range(desde, hasta),
  )
  return data.map((v) => ({
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
export async function subirComprobante(
  empresaId: string,
  movimientoId: string,
  img: Blob,
): Promise<string> {
  const path = `${empresaId}/${movimientoId}.jpg`
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(path, img, { contentType: 'image/jpeg', upsert: true })
  if (error) throw errorDeBase(error)
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
  // El día se recorta al último del mes destino: una cuota del 31 no puede
  // caer el 3 del mes siguiente.
  const ultimoDia = new Date(y!, m! - 1 + meses + 1, 0).getDate()
  const dt = new Date(y!, m! - 1 + meses, Math.min(d!, ultimoDia))
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
  /** Un pago que se repite (un sueldo): sin «(cuota 2/12)» en la descripción. */
  sinNumerar?: boolean
  /** Las fechas exactas de cada pago (a 30, 60, 90 días): si están, mandan sobre frecuencia y cantidad. */
  fechas?: string[]
}

/** Genera la serie completa de cuotas pendientes, unidas por serie_id. */
/** Devuelve el id de la serie: con él se deshace (cancelarSerie). */
export async function crearSerie(input: NuevaSerie): Promise<string> {
  const serieId = crypto.randomUUID()
  const off = MESES_FREQ[input.frecuencia]
  const fechas = input.fechas ?? Array.from({ length: input.cantidad }, (_, i) => addMeses(input.primeraFecha, i * off))
  const filas = fechas.map((fecha, i) => {
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
      descripcion: input.sinNumerar ? input.descripcion.trim() : `${input.descripcion.trim()} (cuota ${i + 1}/${fechas.length})`,
      serie_id: serieId,
    }
  })
  const { error } = await supabase.from('movimiento_financiero').insert(filas)
  if (error) throw errorDeBase(error)
  return serieId
}

/** Cancela (anula) las cuotas pendientes de una serie. Las pagadas quedan. */
export async function cancelarSerie(serieId: string): Promise<void> {
  const { error } = await supabase
    .from('movimiento_financiero')
    .update({ estado: 'anulado' })
    .eq('serie_id', serieId)
    .eq('estado', 'pendiente')
  if (error) throw errorDeBase(error)
}

/** Devuelve el id del movimiento: con él se deshace (anularMovimiento). */
export async function crearMovimiento(input: NuevoMovimiento): Promise<string> {
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
  if (error) throw errorDeBase(error)

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
    if (eLineas) throw errorDeBase(eLineas)
  }
  return id
}

/**
 * El alquiler de un campo, como serie de cuotas pendientes de un año a
 * partir del primer pago: lo pactado entra como costo recurrente del campo
 * en Analítica y la Agenda. Categoría global "Alquiler de campo".
 */
export async function crearAlquilerDeCampo(input: {
  empresaId: string
  campoId: string
  montoCuota: number
  frecuencia: Frecuencia
  primeraFecha: string
  descripcion: string
}): Promise<void> {
  const { data: cat, error } = await supabase
    .from('categoria_movimiento')
    .select('id')
    .is('empresa_id', null)
    .eq('nombre', 'Alquiler de campo')
    .maybeSingle()
  if (error) throw errorDeBase(error)
  if (!cat) throw new Error('No encontramos la categoría "Alquiler de campo".')
  await crearSerie({
    empresaId: input.empresaId,
    tipo: 'gasto',
    categoriaId: cat.id,
    campoId: input.campoId,
    montoCuota: input.montoCuota,
    frecuencia: input.frecuencia,
    primeraFecha: input.primeraFecha,
    // Un año por delante; después lo renueva o lo cancela desde la Agenda.
    cantidad: 12 / MESES_FREQ[input.frecuencia],
    descripcion: input.descripcion,
  })
}
