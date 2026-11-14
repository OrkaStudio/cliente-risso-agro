import { describe, expect, it } from 'vitest'
import type { Vencimiento } from '@/features/agenda/api'
import { cheques, cuandoVence, pactadoDe, proximos30, semanasDelMes, tituloDe } from './agenda'

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
  createdBy: null,
  canal: 'app',
  nuevo: false,
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

  it('los cheques: en cartera, por debitar y los cerrados recientes al final', () => {
    const r = cheques([v({ medio: 'cheque', tipo: 'ingreso', monto: 900 }), v({ medio: 'cheque', monto: 400 }), v({ medio: 'cheque', tipo: 'ingreso', estado: 'liquidado', fechaCobroPago: '2026-10-20' }), v({ medio: 'cheque', estado: 'liquidado', fechaCobroPago: '2026-01-01' }), v({ medio: 'transferencia' })], HOY)
    expect(r.lista.map((c) => c.estado)).toEqual(['En cartera', 'Por debitar', 'Cobrado'])
    expect([r.enCartera, r.emitidos]).toEqual([900, 400])
  })

  it('las semanas del calendario arrancan el lunes y completan el mes', () => {
    const s = semanasDelMes('2026-11')
    expect(s[0]![0]).toBe('2026-10-26')
    expect(s.at(-1)!.at(-1)).toBe('2026-12-06')
    expect(s.every((x) => x.length === 7)).toBe(true)
  })
})

describe('Agenda · el calendario', () => {
  it('cada día: entra, sale, si quedó algo atrasado y si está todo pagado; lo atrasado primero', async () => {
    const { porDia } = await import('./agenda')
    const d = porDia(
      [
        v({ fechaVencimiento: '2026-11-03', monto: 50 }),
        v({ estado: 'liquidado', fechaVencimiento: '2026-11-03', fechaCobroPago: '2026-11-03', monto: 500 }),
        v({ tipo: 'ingreso', fechaVencimiento: '2026-11-14', monto: 900 }),
        v({ estado: 'liquidado', fechaCobroPago: '2026-11-02', monto: 70 }),
      ],
      HOY,
    )
    expect(d.get('2026-11-03')).toMatchObject({ sale: 550, vencido: true, todoPagado: false })
    expect(d.get('2026-11-03')!.items[0]!.monto).toBe(50)
    expect(d.get('2026-11-02')).toMatchObject({ todoPagado: true, vencido: false })
  })
})

describe('Agenda · por semana', () => {
  it('semanas de lunes a domingo desde la de hoy; lo vencido de antes no entra; lo pagado esta semana sí', async () => {
    const { semanasQueVienen, cuotaDe } = await import('./agenda')
    const s = semanasQueVienen(
      [
        v({ fechaVencimiento: '2026-11-03', monto: 1 }), // vencido: se pregunta aparte
        v({ estado: 'liquidado', fechaCobroPago: '2026-11-04', monto: 2 }), // pagado esta semana
        v({ fechaVencimiento: '2026-11-07', monto: 300 }),
        v({ tipo: 'ingreso', fechaVencimiento: '2026-11-14', monto: 900 }),
        v({ fechaVencimiento: '2026-11-30', monto: 50 }),
      ],
      HOY,
      5,
    )
    expect(s.map((x) => [x.desde, x.titulo, x.items.length, x.sale, x.entra])).toEqual([
      ['2026-11-02', 'Esta semana', 2, 300, 0],
      ['2026-11-09', 'La semana que viene', 1, 0, 900],
      ['2026-11-16', 'Del 16 al 22 de noviembre', 0, 0, 0],
      ['2026-11-23', 'Del 23 al 29 de noviembre', 0, 0, 0],
      ['2026-11-30', 'Del 30 de nov al 6 de dic', 1, 50, 0],
    ])
    expect(cuotaDe(v({ descripcion: 'Camioneta (cuota 4/12)' }))).toBe('Cuota 4 de 12')
  })
})
