import { describe, expect, it } from 'vitest'
import type { Vencimiento } from '@/features/agenda/api'
import { cheques, cuandoVence, pactadoDe, gruposLoQueViene, pagadoPorMes, proximos30, semanasDelMes, series, tituloDe } from './agenda'

const v = (x: Partial<Vencimiento>): Vencimiento => ({
  id: crypto.randomUUID(),
  tipo: 'gasto',
  estado: 'pendiente',
  monto: 100,
  fechaVencimiento: '2026-11-10',
  fechaCobroPago: null,
  medio: null,
  esEcheq: false,
  chequeNumero: null,
  chequeBanco: null,
  contraparte: null,
  descripcion: null,
  categoria: null,
  campoId: null,
  campo: null,
  serieId: null,
  conComprobante: false,
  ...x,
})
const HOY = '2026-11-05' // jueves

describe('Agenda', () => {
  it('los próximos 30 días cuentan lo vencido y no lo que ya se pagó', () => {
    const r = proximos30(
      [v({ tipo: 'ingreso', monto: 1000, fechaVencimiento: '2026-11-20' }), v({ monto: 300, fechaVencimiento: '2026-10-01' }), v({ monto: 50, fechaVencimiento: '2027-01-01' }), v({ estado: 'liquidado', fechaCobroPago: '2026-11-04' })],
      HOY,
    )
    expect(r).toEqual({ cobra: 1000, paga: 300, queda: 700, vencidas: 1 })
  })

  it('lo que viene: vencido, esta semana (hasta el domingo), la que viene y por mes', () => {
    const g = gruposLoQueViene([v({ fechaVencimiento: '2026-11-01' }), v({ fechaVencimiento: '2026-11-08' }), v({ fechaVencimiento: '2026-11-09' }), v({ fechaVencimiento: '2026-12-20' }), v({ fechaVencimiento: '2027-01-05' })], HOY)
    expect(g.map((x) => [x.titulo, x.items.length])).toEqual([
      ['Vencido', 1],
      ['Esta semana', 1],
      ['La que viene', 1],
      ['Diciembre', 1],
      ['Enero 2027', 1],
    ])
  })

  it('cuándo vence, dicho como se dice', () => {
    expect(cuandoVence('2026-11-03', HOY).texto).toBe('Venció hace 2 días')
    expect(cuandoVence('2026-11-05', HOY).texto).toBe('Vence hoy')
    expect(cuandoVence('2026-11-14', HOY)).toEqual({ texto: 'En 9 días', tono: 'bien' })
  })

  it('el título sin la cuota ni la estimación', () => {
    expect(tituloDe(v({ descripcion: 'Cubiertas (cuota 2/6)' }))).toBe('Cubiertas')
    expect(tituloDe(v({ descripcion: 'echeq venta terneros' }))).toBe('eCheq venta terneros')
    expect(tituloDe(v({ descripcion: 'Alquiler La Loma · 1.552 kg de novillo/mes · est. a $3.937' }))).toBe('Alquiler La Loma')
    expect(pactadoDe(v({ descripcion: 'Alquiler La Loma · 1.552 kg de novillo/mes · est. a $3.937' }))).toBe('1.552 kg de novillo/mes')
  })

  it('las cuotas: pagadas, lo que falta y la próxima; las terminadas no aparecen', () => {
    const s = series([
      v({ serieId: 's', monto: 300, estado: 'liquidado', fechaVencimiento: '2026-10-10', fechaCobroPago: '2026-10-10', descripcion: 'Cubiertas (cuota 1/3)' }),
      v({ serieId: 's', monto: 300, fechaVencimiento: '2026-11-10' }),
      v({ serieId: 's', monto: 300, fechaVencimiento: '2026-12-10' }),
      v({ serieId: 't', monto: 50, estado: 'liquidado', fechaCobroPago: '2026-10-01' }),
    ])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ nombre: 'Cubiertas', total: 3, pagadas: 1, falta: 600, proxima: '2026-11-10' })
  })

  it('los cheques: en cartera, por debitar y los cerrados recientes al final', () => {
    const r = cheques([v({ medio: 'cheque', tipo: 'ingreso', monto: 900 }), v({ medio: 'cheque', monto: 400 }), v({ medio: 'cheque', tipo: 'ingreso', estado: 'liquidado', fechaCobroPago: '2026-10-20' }), v({ medio: 'cheque', estado: 'liquidado', fechaCobroPago: '2026-01-01' }), v({ medio: 'transferencia' })], HOY)
    expect(r.lista.map((c) => c.estado)).toEqual(['En cartera', 'Por debitar', 'Cobrado'])
    expect([r.enCartera, r.emitidos]).toEqual([900, 400])
  })

  it('ya pagado por mes, del más nuevo al más viejo', () => {
    const m = pagadoPorMes([v({ estado: 'liquidado', fechaCobroPago: '2026-10-02', tipo: 'ingreso', monto: 10 }), v({ estado: 'liquidado', fechaCobroPago: '2026-11-01', monto: 4 }), v({})])
    expect(m.map((x) => [x.ym, x.entro, x.salio])).toEqual([
      ['2026-11', 0, 4],
      ['2026-10', 10, 0],
    ])
  })

  it('las semanas del calendario arrancan el lunes y completan el mes', () => {
    const s = semanasDelMes('2026-11')
    expect(s[0]![0]).toBe('2026-10-26')
    expect(s.at(-1)!.at(-1)).toBe('2026-12-06')
    expect(s.every((x) => x.length === 7)).toBe(true)
  })
})
