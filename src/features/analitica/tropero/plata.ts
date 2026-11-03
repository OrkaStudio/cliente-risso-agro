import type { MovimientoConDetalle, Pendiente } from '@/features/analitica/api'
import { fmtCompact as fmtPesos } from '@/features/analitica/compute'

// Plata (rediseño, Figma página 35 «Plata · La plata»): las cuentas que dicen
// cómo viene el campo en el idioma del productor. Sin React ni red.

/** El blue de cada día (argentinadatos), del más viejo al más nuevo. */
export type DolarDia = { fecha: string; venta: number }

const MS_DIA = 86_400_000
const restarDias = (ymd: string, n: number) => new Date(Date.parse(ymd) - n * MS_DIA).toISOString().slice(0, 10)

/** Lo que se movió de verdad: liquidado, con fecha de cobro o pago. */
const realizado = (m: MovimientoConDetalle) => m.estado === 'liquidado' && !!m.fecha_cobro_pago

/** El dólar de esa fecha, o el último anterior (fines de semana y feriados). */
export function dolarDel(fecha: string, serie: DolarDia[]): number | null {
  let lo = 0
  let hi = serie.length - 1
  let mejor: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (serie[mid]!.fecha <= fecha) {
      mejor = serie[mid]!.venta
      lo = mid + 1
    } else hi = mid - 1
  }
  return mejor
}

export type Anio = {
  entro: number
  salio: number
  resultado: number
  /** Variación del resultado contra los 12 meses anteriores, medida en dólares (null si no hay base). */
  variacionUsd: number | null
  /** Resultado en dólares de este año y del anterior (null si no hay año anterior). */
  usd: number
  usdAntes: number | null
}

/** El período que se mira en Plata y el mismo período un año antes, para comparar. */
export type Periodo = { clave: 'doce' | 'campana' | 'pasada'; nombre: string; desde: string; hasta: string; antesDesde: string; antesHasta: string; enCurso: boolean }

const menosUnAnio = (ymd: string) => restarDias(ymd, 365)
/** La campaña ganadera va de julio a junio; «26/27» es la que arrancó en julio de 2026. */
export const inicioCampana = (hoy: string) => `${Number(hoy.slice(5, 7)) >= 7 ? hoy.slice(0, 4) : Number(hoy.slice(0, 4)) - 1}-07-01`
export const nombreCampana = (inicio: string) => `${inicio.slice(2, 4)}/${String(Number(inicio.slice(2, 4)) + 1).padStart(2, '0')}`

/** Los últimos 12 meses, la campaña en curso y la campaña pasada entera. */
export function periodos(hoy: string): Periodo[] {
  const desde12 = restarDias(hoy, 364)
  const inicio = inicioCampana(hoy)
  const inicioPasada = `${Number(inicio.slice(0, 4)) - 1}-07-01`
  const finPasada = restarDias(inicio, 1)
  return [
    { clave: 'doce', nombre: '12 meses', desde: desde12, hasta: hoy, antesDesde: menosUnAnio(desde12), antesHasta: menosUnAnio(hoy), enCurso: true },
    { clave: 'campana', nombre: `Campaña ${nombreCampana(inicio)}`, desde: inicio, hasta: hoy, antesDesde: inicioPasada, antesHasta: menosUnAnio(hoy), enCurso: true },
    { clave: 'pasada', nombre: `Campaña ${nombreCampana(inicioPasada)}`, desde: inicioPasada, hasta: finPasada, antesDesde: `${Number(inicioPasada.slice(0, 4)) - 1}-07-01`, antesHasta: restarDias(inicioPasada, 1), enCurso: false },
  ]
}

/**
 * Lo que entró y salió en el período, y la comparación con el mismo período un
 * año antes. La comparación va en dólares del día de cada movimiento (Lau,
 * 03/11): en pesos la inflación la vuelve mentira.
 */
export function resumenPeriodo(movs: MovimientoConDetalle[], p: Periodo, serie: DolarDia[]): Anio {
  let entro = 0
  let salio = 0
  let usd = 0
  let usdAntes = 0
  let hayAntes = false
  for (const m of movs) {
    if (!realizado(m)) continue
    const f = m.fecha_cobro_pago!
    const signo = m.tipo === 'ingreso' ? 1 : -1
    const monto = Number(m.monto)
    const d = dolarDel(f, serie)
    if (f >= p.desde && f <= p.hasta) {
      if (signo > 0) entro += monto
      else salio += monto
      if (d) usd += (signo * monto) / d
    } else if (f >= p.antesDesde && f <= p.antesHasta) {
      hayAntes = true
      if (d) usdAntes += (signo * monto) / d
    }
  }
  const variacionUsd = hayAntes && serie.length && usdAntes !== 0 ? (usd - usdAntes) / Math.abs(usdAntes) : null
  return { entro, salio, resultado: entro - salio, variacionUsd, usd, usdAntes: hayAntes ? usdAntes : null }
}

/** Los últimos 12 meses contra los 12 anteriores. */
export const ultimoAnio = (movs: MovimientoConDetalle[], hoy: string, serie: DolarDia[]) => resumenPeriodo(movs, periodos(hoy)[0]!, serie)

/** Lo realizado dentro del período. */
export const delPeriodo = (movs: MovimientoConDetalle[], desde: string, hasta: string) =>
  movs.filter((m) => realizado(m) && m.fecha_cobro_pago! >= desde && m.fecha_cobro_pago! <= hasta)

export type Campana = { nombre: string; enCurso: boolean; entro: number; salio: number; resultado: number; usd: number | null }

/** Campaña por campaña (julio a junio), de la más nueva a la más vieja. Sólo las que tienen movimientos. */
export function campanas(movs: MovimientoConDetalle[], hoy: string, serie: DolarDia[], n = 3): Campana[] {
  const inicio = Number(inicioCampana(hoy).slice(0, 4))
  const filas: Campana[] = []
  for (let k = 0; k < n; k++) {
    const desde = `${inicio - k}-07-01`
    const hasta = k === 0 ? hoy : `${inicio - k + 1}-06-30`
    let entro = 0
    let salio = 0
    let usd = 0
    let conDolar = serie.length > 0
    for (const m of delPeriodo(movs, desde, hasta)) {
      const monto = Number(m.monto)
      const d = dolarDel(m.fecha_cobro_pago!, serie)
      if (!d) conDolar = false
      if (m.tipo === 'ingreso') {
        entro += monto
        if (d) usd += monto / d
      } else {
        salio += monto
        if (d) usd -= monto / d
      }
    }
    if (entro || salio) filas.push({ nombre: nombreCampana(desde), enCurso: k === 0, entro, salio, resultado: entro - salio, usd: conDolar ? usd : null })
  }
  return filas
}

/** Lo gastado por categoría en dólares del día, para comparar entre períodos sin la inflación. */
export function gastosUsdPorCategoria(movs: MovimientoConDetalle[], desde: string, hasta: string, serie: DolarDia[]): Map<string, number> {
  const r = new Map<string, number>()
  for (const m of delPeriodo(movs, desde, hasta)) {
    if (m.tipo !== 'gasto') continue
    const d = dolarDel(m.fecha_cobro_pago!, serie)
    if (!d) continue
    const k = m.categoria?.nombre ?? 'Sin categoría'
    r.set(k, (r.get(k) ?? 0) + Number(m.monto) / d)
  }
  return r
}

/** Un aviso de «Para mejorar»: qué pasa, por qué importa y adónde ir a hacer algo. */
export type Aviso = { id: string; tono: 'mal' | 'atencion'; titulo: string; detalle: string; accion: { texto: string; a: string } }

/**
 * Lo que conviene mirar, de lo más urgente a lo menos (Lau, 03/11: que Plata
 * ayude a mejorar, no sólo informe). Como mucho tres. Todo sale de sus datos y
 * del precio del gordo: nada de pesos ni cabezas supuestos (Lau, 03/11).
 */
export function avisosParaMejorar(x: {
  apretado: Apretado | null
  gordo: number | null
  gastosAhora: Map<string, number>
  gastosAntes: Map<string, number>
  campos: { nombre: string; resultado: number; gastos: number; ingresos: number; hectareas: number | null }[]
  periodo: Periodo
}): Aviso[] {
  const avisos: Aviso[] = []
  const pesos = (n: number) => fmtPesos(n)

  if (x.apretado) {
    const falta = x.apretado.sale - x.apretado.entra
    const mes = nombreMes(x.apretado.mes)
    const kg = x.gordo ? Math.round(falta / x.gordo / 10) * 10 : null
    avisos.push({
      id: 'apretado',
      tono: 'mal',
      titulo: `Para cubrir ${mes} faltan ${pesos(falta)}`,
      detalle: kg
        ? `A precio de hoy son unos ${kg.toLocaleString('es-AR')} kg de gordo. Se puede adelantar una venta o correr un pago.`
        : 'Se puede adelantar una venta o correr un pago.',
      accion: { texto: 'Ver la agenda', a: '/agenda' },
    })
  }

  const totalAhora = [...x.gastosAhora.values()].reduce((s, v) => s + v, 0)
  let subio: { nombre: string; ratio: number; ahora: number; antes: number } | null = null
  for (const [nombre, ahora] of x.gastosAhora) {
    const antes = x.gastosAntes.get(nombre) ?? 0
    if (antes <= 0 || ahora < totalAhora * 0.05) continue
    const ratio = ahora / antes
    if (ratio >= 1.2 && (!subio || ratio > subio.ratio)) subio = { nombre, ratio, ahora, antes }
  }
  if (subio) {
    const usd = (n: number) => `US$ ${Math.round(n / 1000).toLocaleString('es-AR')} mil`
    avisos.push({
      id: 'subio',
      tono: 'atencion',
      titulo: `${subio.nombre} subió ${Math.round((subio.ratio - 1) * 100)} % en dólares`,
      detalle: `Contra el mismo período del año anterior: de ${usd(subio.antes)} a ${usd(subio.ahora)}. Vale revisar precios o proveedor.`,
      accion: { texto: 'Ver esos gastos', a: `/analitica/movimientos?rango=todo&q=${encodeURIComponent(subio.nombre)}` },
    })
  }

  const peor = x.campos.filter((c) => c.resultado < 0).sort((a, b) => a.resultado - b.resultado)[0]
  if (peor) {
    const porHa = peor.hectareas ? Math.round(peor.resultado / peor.hectareas) : null
    avisos.push({
      id: 'campo',
      tono: 'atencion',
      titulo: `${peor.nombre} pierde plata`,
      detalle: `${peor.ingresos ? `Entró ${pesos(peor.ingresos)} y salió ${pesos(peor.gastos)}` : `Salió ${pesos(peor.gastos)} y no entró nada`}${porHa ? `: ${pesos(porHa)} por hectárea` : ''}${porHa && x.gordo ? `, unos ${Math.round(Math.abs(porHa) / x.gordo)} kg de gordo por ha` : ''}.`,
      accion: { texto: 'Ver sus movimientos', a: `/analitica/movimientos?rango=todo&q=${encodeURIComponent(peor.nombre)}` },
    })
  }
  return avisos.slice(0, 3)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? ''

export type Apretado = { mes: string; sale: number; entra: number; proximoIngreso: string | null }

/**
 * El mes más apretado de lo que viene: el que más plata saca neta, de los
 * próximos 6. null si en ninguno sale más de lo que entra.
 */
export function mesMasApretado(pendientes: Pendiente[], hoy: string): Apretado | null {
  const hasta = restarDias(hoy, -183)
  const porMes = new Map<string, { entra: number; sale: number }>()
  for (const p of pendientes) {
    if (!p.fechaVencimiento || p.monto == null || p.fechaVencimiento > hasta) continue
    const mes = (p.fechaVencimiento < hoy ? hoy : p.fechaVencimiento).slice(0, 7)
    const v = porMes.get(mes) ?? { entra: 0, sale: 0 }
    if (p.tipo === 'ingreso') v.entra += p.monto
    else v.sale += p.monto
    porMes.set(mes, v)
  }
  let peor: { mes: string; neto: number; entra: number; sale: number } | null = null
  for (const [mes, v] of porMes) {
    const neto = v.entra - v.sale
    if (neto < 0 && (!peor || neto < peor.neto)) peor = { mes, neto, ...v }
  }
  if (!peor) return null
  const proximoIngreso =
    pendientes
      .filter((p) => p.tipo === 'ingreso' && p.fechaVencimiento && p.fechaVencimiento >= hoy)
      .map((p) => p.fechaVencimiento!)
      .sort()[0] ?? null
  return { mes: peor.mes, sale: peor.sale, entra: peor.entra, proximoIngreso }
}

/** Los próximos cobros y pagos con fecha, del más cercano al más lejano. */
export function proximos(pendientes: Pendiente[], hoy: string, n = 3): Pendiente[] {
  return pendientes
    .filter((p) => p.fechaVencimiento && p.monto != null && p.fechaVencimiento >= hoy)
    .sort((a, b) => a.fechaVencimiento!.localeCompare(b.fechaVencimiento!))
    .slice(0, n)
}

/**
 * La comparación con el año anterior, en dólares, como se diría. Si los dos años
 * ganaron, el porcentaje; si alguno perdió, el porcentaje confunde: el dato.
 */
export function comparacionTexto(a: Anio, antes = 'el año anterior'): string | null {
  if (a.usdAntes == null || a.variacionUsd == null) return null
  const usd = (n: number) => `US$ ${Math.round(Math.abs(n) / 1000).toLocaleString('es-AR')} mil`
  if (a.usd > 0 && a.usdAntes > 0) {
    const pct = Math.round(Math.abs(a.variacionUsd) * 100)
    return pct < 1 ? `Lo mismo que ${antes}, en dólares.` : `Un ${pct} % ${a.variacionUsd > 0 ? 'más' : 'menos'} que ${antes}, en dólares.`
  }
  return `${antes.replace(/^\w/, (c) => c.toUpperCase())} ${a.usdAntes >= 0 ? 'ganaron' : 'perdieron'} ${usd(a.usdAntes)}; ahora, ${a.usd >= 0 ? 'ganan' : 'pierden'} ${usd(a.usd)}.`
}

/** El período de la lista de movimientos. */
export type Rango = 'mes' | 'anio' | '12m' | 'todo'

/** Lo que ya entró o salió en el período (lo pendiente vive en «Lo que viene» y la Agenda). */
export function enRango(m: MovimientoConDetalle, r: Rango, hoy: string): boolean {
  if (!realizado(m)) return false
  const f = m.fecha_cobro_pago!
  if (r === 'todo') return true
  if (r === 'mes') return f.slice(0, 7) === hoy.slice(0, 7)
  if (r === 'anio') return f.slice(0, 4) === hoy.slice(0, 4)
  return f > restarDias(hoy, 365) && f <= hoy
}

/** Busca por proveedor, detalle, categoría o CUIT, sin tildes ni mayúsculas. */
export function coincide(m: MovimientoConDetalle, q: string): boolean {
  const n = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '')
  const t = n(q).trim()
  if (!t) return true
  const digitos = t.replace(/\D/g, '')
  return [m.contraparte, m.descripcion, m.categoria?.nombre, m.campo?.nombre].some((x) => n(x).includes(t)) || (!!digitos && (m.cuit_contraparte ?? '').replace(/\D/g, '').includes(digitos))
}

const MEDIO: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', mercadopago: 'Mercado Pago', otro: 'Otro' }
export const medioTexto = (m: MovimientoConDetalle) => (m.es_echeq ? 'eCheq' : m.medio_pago ? (MEDIO[m.medio_pago] ?? m.medio_pago) : null)
export const comprobanteTexto = (m: MovimientoConDetalle) =>
  m.comprobante_tipo ? (m.comprobante_tipo === 'otro' ? 'Comprobante' : `Factura ${m.comprobante_tipo.toUpperCase()}`) : m.comprobante_url ? 'Comprobante' : 'Sin comprobante'

/** Los movimientos en CSV para Excel (separador «;», coma decimal, con BOM). */
export function aCsv(movs: MovimientoConDetalle[]): string {
  const celda = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? v.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 2 }) : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const filas = [
    ['Fecha', 'Tipo', 'Detalle', 'Categoría', 'Campo', 'Proveedor o cliente', 'CUIT', 'Medio', 'Comprobante', 'Estado', 'Neto', 'IVA', 'Total'],
    ...movs.map((m) => [
      m.fecha_cobro_pago ?? m.fecha_devengo,
      m.tipo === 'ingreso' ? 'Entró' : 'Salió',
      m.descripcion,
      m.categoria?.nombre,
      m.campo?.nombre,
      m.contraparte,
      m.cuit_contraparte,
      medioTexto(m),
      comprobanteTexto(m),
      m.estado === 'liquidado' ? 'Pagado' : m.estado === 'pendiente' ? 'Pendiente' : 'Anulado',
      m.neto_total == null ? null : Number(m.neto_total),
      m.iva_total == null ? null : Number(m.iva_total),
      (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto),
    ]),
  ]
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}

export type Mes = { mes: string; entro: number; salio: number; /** Lo que todavía no pasó: cobros y pagos anotados con fecha. */ futuro: boolean }

const sumarMeses = (ym: string, n: number) => {
  const [a, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * La plata mes a mes: los 12 meses que pasaron con lo que entró y salió de verdad,
 * y los 6 que vienen con lo anotado que vence (lo vencido sin pagar cae en este mes).
 * El mes de hoy suma las dos cosas.
 */
export function mesAMes(movs: MovimientoConDetalle[], pendientes: Pendiente[], hoy: string, atras = 11, adelante = 6): Mes[] {
  const actual = hoy.slice(0, 7)
  const meses: Mes[] = []
  for (let i = -atras; i <= adelante; i++) meses.push({ mes: sumarMeses(actual, i), entro: 0, salio: 0, futuro: i > 0 })
  const idx = new Map(meses.map((m, i) => [m.mes, i]))
  for (const m of movs) {
    if (!realizado(m)) continue
    const i = idx.get(m.fecha_cobro_pago!.slice(0, 7))
    if (i == null || meses[i]!.futuro) continue
    if (m.tipo === 'ingreso') meses[i]!.entro += Number(m.monto)
    else meses[i]!.salio += Number(m.monto)
  }
  for (const p of pendientes) {
    if (!p.fechaVencimiento || p.monto == null) continue
    const i = idx.get((p.fechaVencimiento < hoy ? hoy : p.fechaVencimiento).slice(0, 7))
    if (i == null) continue
    if (p.tipo === 'ingreso') meses[i]!.entro += p.monto
    else meses[i]!.salio += p.monto
  }
  return meses
}
