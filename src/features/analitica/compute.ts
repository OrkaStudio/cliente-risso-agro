import type { MovimientoConDetalle } from '@/features/analitica/api'
import type { Database } from '@/lib/supabase/types'

type Actividad = Database['public']['Enums']['actividad_movimiento']

export const actividadLabel: Record<Actividad, string> = {
  cria: 'Cría',
  invernada: 'Invernada',
  agricultura: 'Agricultura',
  estructura: 'Estructura',
}

export type Modo = 'devengado' | 'caja'
export type Resumen = { ingresos: number; gastos: number; resultado: number }
export type LineaMonto = { nombre: string; monto: number }

/**
 * Las dos verdades de D6:
 *  - devengado: economía real (todo lo no anulado, por fecha de devengo).
 *  - caja: plata que se movió de verdad (solo liquidado, con fecha de cobro/pago).
 */
function entra(m: MovimientoConDetalle, modo: Modo): boolean {
  if (m.estado === 'anulado') return false
  if (modo === 'caja') return m.estado === 'liquidado' && !!m.fecha_cobro_pago
  return true
}

export function resumen(movs: MovimientoConDetalle[], modo: Modo): Resumen {
  let ingresos = 0
  let gastos = 0
  for (const m of movs) {
    if (!entra(m, modo)) continue
    if (m.tipo === 'ingreso') ingresos += Number(m.monto)
    else gastos += Number(m.monto)
  }
  return { ingresos, gastos, resultado: ingresos - gastos }
}

/** Resultado (ingresos − gastos) por campo. */
export function porCampo(
  movs: MovimientoConDetalle[],
  modo: Modo,
): LineaMonto[] {
  const map = new Map<string, number>()
  for (const m of movs) {
    if (!entra(m, modo)) continue
    const nombre = m.campo?.nombre ?? 'Sin campo'
    const delta = m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)
    map.set(nombre, (map.get(nombre) ?? 0) + delta)
  }
  return [...map.entries()]
    .map(([nombre, monto]) => ({ nombre, monto }))
    .sort((a, b) => b.monto - a.monto)
}

export type LineaMes = { mes: string; resultado: number }

/** Resultado neto por mes (para el gráfico de barras). Usa la fecha que
 *  corresponde al modo: devengo en 'devengado', cobro/pago en 'caja'. */
export function resultadoPorMes(
  movs: MovimientoConDetalle[],
  modo: Modo,
): LineaMes[] {
  const map = new Map<string, number>()
  for (const m of movs) {
    if (!entra(m, modo)) continue
    const fecha = modo === 'caja' ? m.fecha_cobro_pago : m.fecha_devengo
    if (!fecha) continue
    const mes = fecha.slice(0, 7) // YYYY-MM
    const delta = m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)
    map.set(mes, (map.get(mes) ?? 0) + delta)
  }
  return [...map.entries()]
    .map(([mes, resultado]) => ({ mes, resultado }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

/** Monto agrupado por categoría para un tipo (ingreso/gasto), mayor a menor. */
export function montoPorCategoria(
  movs: MovimientoConDetalle[],
  modo: Modo,
  tipo: 'ingreso' | 'gasto',
): LineaMonto[] {
  const map = new Map<string, number>()
  for (const m of movs) {
    if (!entra(m, modo) || m.tipo !== tipo) continue
    const nombre = m.categoria?.nombre ?? 'Sin categoría'
    map.set(nombre, (map.get(nombre) ?? 0) + Number(m.monto))
  }
  return [...map.entries()]
    .map(([nombre, monto]) => ({ nombre, monto }))
    .sort((a, b) => b.monto - a.monto)
}

export const gastosPorCategoria = (m: MovimientoConDetalle[], modo: Modo) =>
  montoPorCategoria(m, modo, 'gasto')
export const ingresosPorCategoria = (m: MovimientoConDetalle[], modo: Modo) =>
  montoPorCategoria(m, modo, 'ingreso')

/**
 * Cuentas pendientes (independiente del modo): lo que falta cobrar y pagar.
 * Explica la brecha devengado↔caja.
 */
export function cuentasPendientes(movs: MovimientoConDetalle[]): {
  porCobrar: number
  porPagar: number
} {
  let porCobrar = 0
  let porPagar = 0
  for (const m of movs) {
    if (m.estado !== 'pendiente') continue
    if (m.tipo === 'ingreso') porCobrar += Number(m.monto)
    else porPagar += Number(m.monto)
  }
  return { porCobrar, porPagar }
}

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
export const formatARS = (n: number) => fmt.format(n)

// ===== Rentabilidad por potrero =====
// Lo que más le importa al productor: qué potrero rindió y cuál no. Solo entran
// los movimientos imputados a un potrero (los de nivel campo no se prorratean).

export type LineaPotrero = {
  potreroId: string
  nombre: string
  campoNombre: string
  monto: number
}

export function porPotrero(
  movs: MovimientoConDetalle[],
  modo: Modo,
): LineaPotrero[] {
  const map = new Map<string, LineaPotrero>()
  for (const m of movs) {
    if (!entra(m, modo) || !m.potrero_id) continue
    const prev = map.get(m.potrero_id) ?? {
      potreroId: m.potrero_id,
      nombre: m.potrero?.nombre ?? 'Potrero',
      campoNombre: m.campo?.nombre ?? '',
      monto: 0,
    }
    const delta = m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)
    map.set(m.potrero_id, { ...prev, monto: prev.monto + delta })
  }
  return [...map.values()].sort((a, b) => b.monto - a.monto)
}

// ===== Rentabilidad por actividad =====
// La pregunta clave en ganadería (donde la hacienda se mueve entre potreros):
// ¿qué actividad rinde? cría / invernada / agricultura, y estructura como costo.

export type LineaActividad = {
  actividad: Actividad | 'sin'
  ingresos: number
  gastos: number
  resultado: number
}

const ORDEN_ACT: (Actividad | 'sin')[] = [
  'cria',
  'invernada',
  'agricultura',
  'estructura',
  'sin',
]

export function porActividad(
  movs: MovimientoConDetalle[],
  modo: Modo,
): LineaActividad[] {
  const map = new Map<Actividad | 'sin', LineaActividad>()
  for (const m of movs) {
    if (!entra(m, modo)) continue
    const key = (m.actividad ?? 'sin') as Actividad | 'sin'
    const prev = map.get(key) ?? {
      actividad: key,
      ingresos: 0,
      gastos: 0,
      resultado: 0,
    }
    if (m.tipo === 'ingreso') prev.ingresos += Number(m.monto)
    else prev.gastos += Number(m.monto)
    prev.resultado = prev.ingresos - prev.gastos
    map.set(key, prev)
  }
  return [...map.values()].sort(
    (a, b) => ORDEN_ACT.indexOf(a.actividad) - ORDEN_ACT.indexOf(b.actividad),
  )
}
