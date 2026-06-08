import type { MovimientoConDetalle } from '@/features/analitica/api'

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

/** Gastos agrupados por categoría (mayor a menor). */
export function gastosPorCategoria(
  movs: MovimientoConDetalle[],
  modo: Modo,
): LineaMonto[] {
  const map = new Map<string, number>()
  for (const m of movs) {
    if (!entra(m, modo) || m.tipo !== 'gasto') continue
    const nombre = m.categoria?.nombre ?? 'Sin categoría'
    map.set(nombre, (map.get(nombre) ?? 0) + Number(m.monto))
  }
  return [...map.entries()]
    .map(([nombre, monto]) => ({ nombre, monto }))
    .sort((a, b) => b.monto - a.monto)
}

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
export const formatARS = (n: number) => fmt.format(n)
