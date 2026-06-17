import type { MovimientoConDetalle, Pendiente } from '@/features/analitica/api'

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

// ===== Proyección de flujo de fondos =====
// La pregunta del productor: "¿me va a alcanzar la plata?". Desde el saldo de
// hoy, aplicamos los cobros (+) y pagos (−) pendientes por su vencimiento y
// vemos cómo evoluciona la caja — y si en algún momento queda en rojo.

export type PuntoFlujo = {
  fecha: string
  balance: number
  descripcion?: string
  tipo?: 'ingreso' | 'gasto'
  monto?: number
}
export type EventoFlujo = {
  id: string
  fecha: string
  descripcion: string
  tipo: 'ingreso' | 'gasto'
  monto: number
  balance: number
}
export type Proyeccion = {
  puntos: PuntoFlujo[]
  eventos: EventoFlujo[]
  saldoInicial: number
  saldoFinal: number
  minBalance: number
  fechaMin: string
  primerNegativo: { fecha: string; balance: number } | null
  totalCobrar: number
  totalPagar: number
  sinFecha: Pendiente[]
}

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function proyectarFlujo(
  saldoInicial: number,
  pend: Pendiente[],
  horizonteDias = 90,
): Proyeccion {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const limite = new Date(hoy)
  limite.setDate(limite.getDate() + horizonteDias)

  const sinFecha = pend.filter((p) => !p.fechaVencimiento || p.monto == null)
  const conFecha = pend
    .filter((p) => p.fechaVencimiento && p.monto != null)
    .sort((a, b) => (a.fechaVencimiento! < b.fechaVencimiento! ? -1 : 1))

  let balance = saldoInicial
  let minBalance = balance
  let fechaMin = isoLocal(hoy)
  let primerNegativo: { fecha: string; balance: number } | null = null
  let totalCobrar = 0
  let totalPagar = 0

  const puntos: PuntoFlujo[] = [{ fecha: isoLocal(hoy), balance }]
  const eventos: EventoFlujo[] = []

  for (const p of conFecha) {
    const [y, m, d] = p.fechaVencimiento!.split('-').map(Number)
    if (new Date(y, m - 1, d) > limite) continue
    const monto = Number(p.monto)
    const tipo = p.tipo ?? 'gasto'
    if (tipo === 'ingreso') {
      balance += monto
      totalCobrar += monto
    } else {
      balance -= monto
      totalPagar += monto
    }
    eventos.push({
      id: p.id,
      fecha: p.fechaVencimiento!,
      descripcion: p.descripcion,
      tipo,
      monto,
      balance,
    })
    puntos.push({
      fecha: p.fechaVencimiento!,
      balance,
      descripcion: p.descripcion,
      tipo,
      monto,
    })
    if (balance < minBalance) {
      minBalance = balance
      fechaMin = p.fechaVencimiento!
    }
    if (!primerNegativo && balance < 0)
      primerNegativo = { fecha: p.fechaVencimiento!, balance }
  }

  return {
    puntos,
    eventos,
    saldoInicial,
    saldoFinal: balance,
    minBalance,
    fechaMin,
    primerNegativo,
    totalCobrar,
    totalPagar,
    sinFecha,
  }
}
