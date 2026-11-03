import { describe, expect, it } from 'vitest'
import type { MovimientoConDetalle, Pendiente } from '@/features/analitica/api'
import { aCsv, avisosParaMejorar, campanas, coincide, comparacionTexto, mesAMes, periodos, dolarDel, enRango, mesMasApretado, proximos, ultimoAnio, type DolarDia } from './plata'

const mov = (x: Partial<MovimientoConDetalle>): MovimientoConDetalle =>
  ({
    id: crypto.randomUUID(),
    tipo: 'gasto',
    estado: 'liquidado',
    monto: 100,
    fecha_devengo: '2026-10-01',
    fecha_cobro_pago: '2026-10-01',
    categoria: null,
    campo: null,
    potrero: null,
    ...x,
  }) as MovimientoConDetalle
const pend = (x: Partial<Pendiente>): Pendiente => ({ id: crypto.randomUUID(), campoId: null, descripcion: '', tipo: 'gasto', monto: 100, fechaVencimiento: '2026-11-10', diasParaVencer: 0, ...x })

const SERIE: DolarDia[] = [
  { fecha: '2025-01-01', venta: 1000 },
  { fecha: '2026-01-01', venta: 1250 },
]

describe('Plata', () => {
  it('el dólar de un día sin cotización es el último anterior', () => {
    expect(dolarDel('2025-06-15', SERIE)).toBe(1000)
    expect(dolarDel('2026-03-01', SERIE)).toBe(1250)
    expect(dolarDel('2024-01-01', SERIE)).toBeNull()
  })

  it('los últimos 12 meses, comparados en dólares con los 12 anteriores', () => {
    const a = ultimoAnio(
      [
        mov({ tipo: 'ingreso', monto: 2_500_000, fecha_cobro_pago: '2026-06-01' }), // US$2.000
        mov({ tipo: 'gasto', monto: 1_250_000, fecha_cobro_pago: '2026-07-01' }), // US$1.000
        mov({ tipo: 'ingreso', monto: 1_000_000, fecha_cobro_pago: '2025-06-01' }), // año anterior: US$1.000
        mov({ tipo: 'gasto', monto: 999_999, estado: 'pendiente', fecha_cobro_pago: null }),
      ],
      '2026-11-03',
      SERIE,
    )
    expect(a).toMatchObject({ entro: 2_500_000, salio: 1_250_000, resultado: 1_250_000 })
    expect(a.variacionUsd).toBeCloseTo(0, 5) // US$1.000 contra US$1.000
  })

  it('sin año anterior no hay comparación', () => {
    expect(ultimoAnio([mov({ fecha_cobro_pago: '2026-10-01' })], '2026-11-03', SERIE).variacionUsd).toBeNull()
  })

  it('el mes más apretado es el que más saca neto, y dice cuándo vuelve a entrar', () => {
    const a = mesMasApretado(
      [pend({ fechaVencimiento: '2026-11-10', monto: 500 }), pend({ fechaVencimiento: '2026-12-05', monto: 5750 }), pend({ tipo: 'ingreso', fechaVencimiento: '2027-01-04', monto: 9000 })],
      '2026-11-03',
    )
    expect(a).toEqual({ mes: '2026-12', sale: 5750, entra: 0, proximoIngreso: '2027-01-04' })
    expect(mesMasApretado([pend({ tipo: 'ingreso' })], '2026-11-03')).toBeNull()
  })

  it('lo vencido cuenta en el mes de hoy; lo próximo, en orden', () => {
    expect(mesMasApretado([pend({ fechaVencimiento: '2026-09-01' })], '2026-11-03')?.mes).toBe('2026-11')
    expect(proximos([pend({ fechaVencimiento: '2026-12-01' }), pend({ fechaVencimiento: '2026-11-05' }), pend({ fechaVencimiento: '2026-10-01' })], '2026-11-03').map((p) => p.fechaVencimiento)).toEqual(['2026-11-05', '2026-12-01'])
  })

  it('el rango y la búsqueda de la lista', () => {
    const m = mov({ fecha_cobro_pago: '2026-11-02', contraparte: 'Shell Deheza S.A.', cuit_contraparte: '30-50672834-1' })
    expect(enRango(m, 'mes', '2026-11-03')).toBe(true)
    expect(enRango(mov({ fecha_cobro_pago: '2026-10-30' }), 'mes', '2026-11-03')).toBe(false)
    // Lo pendiente no «salió» todavía.
    expect(enRango(mov({ estado: 'pendiente', fecha_cobro_pago: null, fecha_devengo: '2026-11-20' }), 'mes', '2026-11-03')).toBe(false)
    expect(coincide(m, 'shell')).toBe(true)
    expect(coincide(m, '50672834')).toBe(true)
    expect(coincide(m, 'ypf')).toBe(false)
  })

  it('el CSV para Excel: «;», coma decimal y el signo según entró o salió', () => {
    const csv = aCsv([mov({ descripcion: 'Gasoil; 50 l', monto: 1234.5 })])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Gasoil; 50 l"')
    expect(csv).toContain('-1234,5')
  })
  it('la comparación: porcentaje si los dos años ganan; si no, el dato en dólares', () => {
    const base = { entro: 0, salio: 0, resultado: 0 }
    expect(comparacionTexto({ ...base, usd: 13000, usdAntes: 10000, variacionUsd: 0.3 })).toBe('Un 30 % más que el año anterior, en dólares.')
    expect(comparacionTexto({ ...base, usd: -34000, usdAntes: 5000, variacionUsd: -7.8 })).toBe('El año anterior ganaron US$ 5 mil; ahora, pierden US$ 34 mil.')
    expect(comparacionTexto({ ...base, usd: 1000, usdAntes: null, variacionUsd: null })).toBeNull()
  })
  it('mes a mes: lo que pasó, y lo anotado que viene (lo vencido cae en este mes)', () => {
    const meses = mesAMes(
      [mov({ tipo: 'ingreso', monto: 500, fecha_cobro_pago: '2026-10-15' }), mov({ monto: 200, fecha_cobro_pago: '2025-10-15' })],
      [pend({ fechaVencimiento: '2026-10-20', monto: 70 }), pend({ tipo: 'ingreso', fechaVencimiento: '2027-02-01', monto: 900 })],
      '2026-11-03',
    )
    expect(meses).toHaveLength(18)
    expect(meses[0]).toMatchObject({ mes: '2025-12', futuro: false })
    expect(meses.find((m) => m.mes === '2026-10')).toMatchObject({ entro: 500, salio: 0 })
    expect(meses.find((m) => m.mes === '2026-11')).toMatchObject({ salio: 70, futuro: false })
    expect(meses.find((m) => m.mes === '2027-02')).toMatchObject({ entro: 900, futuro: true })
  })
  it('los períodos: 12 meses, la campaña en curso (julio a junio) y la pasada, cada uno con su año anterior', () => {
    const [doce, campana, pasada] = periodos('2026-11-03')
    expect(doce).toMatchObject({ desde: '2025-11-04', hasta: '2026-11-03' })
    expect(campana).toMatchObject({ nombre: 'Campaña 26/27', desde: '2026-07-01', antesDesde: '2025-07-01', antesHasta: '2025-11-03' })
    expect(pasada).toMatchObject({ nombre: 'Campaña 25/26', desde: '2025-07-01', hasta: '2026-06-30', antesDesde: '2024-07-01', antesHasta: '2025-06-30' })
    expect(periodos('2026-03-10')[1]!.nombre).toBe('Campaña 25/26')
  })

  it('campaña por campaña: la en curso hasta hoy y las anteriores enteras, en pesos y dólares', () => {
    const filas = campanas(
      [mov({ tipo: 'ingreso', monto: 2500, fecha_cobro_pago: '2026-08-01' }), mov({ monto: 1000, fecha_cobro_pago: '2025-08-01' })],
      '2026-11-03',
      SERIE,
    )
    expect(filas).toEqual([
      { nombre: '26/27', enCurso: true, entro: 2500, salio: 0, resultado: 2500, usd: 2 },
      { nombre: '25/26', enCurso: false, entro: 0, salio: 1000, resultado: -1000, usd: -1 },
    ])
  })

  it('para mejorar: el mes apretado en kilos de gordo, el gasto que subió en dólares y el campo que pierde', () => {
    const avisos = avisosParaMejorar({
      apretado: { mes: '2026-12', sale: 21_000_000, entra: 0, proximoIngreso: '2027-03-18' },
      gordo: 4000,
      gastosAhora: new Map([['Combustible', 13_800], ['Sueldos', 50_000]]),
      gastosAntes: new Map([['Combustible', 10_000], ['Sueldos', 49_000]]),
      campos: [{ nombre: 'La Loma', resultado: -30_000_000, gastos: 30_000_000, ingresos: 0, hectareas: 500 }],
      periodo: periodos('2026-11-03')[0]!,
    })
    expect(avisos.map((a) => a.id)).toEqual(['apretado', 'subio', 'campo'])
    expect(avisos[0]!.detalle).toContain('unos 5.250 kg de gordo.')
    expect(avisos[0]!.detalle).not.toMatch(/novillo/)
    expect(avisos[1]!.titulo).toBe('Combustible subió 38 % en dólares')
    expect(avisos[2]!.detalle).toContain('15 kg de gordo por ha')
  })
})
