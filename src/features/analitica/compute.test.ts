/**
 * Auditoría aritmética de Analítica — Fase 1.
 *
 * REGLA DE ESTA SUITE: cada valor esperado se deriva de la regla de negocio
 * declarada (D6: devengado = economía real; caja = plata que se movió), NO de
 * lo que `compute.ts` devuelve hoy. Un test en rojo es un hallazgo, no un
 * expected mal puesto.
 *
 * Zona horaria: los tests corren con TZ=America/Argentina/Buenos_Aires porque
 * los usuarios están en Argentina (UTC−3) y varias funciones de período
 * mezclan hora local con `toISOString()` (UTC).
 */
import { describe, expect, it } from 'vitest'
import type { MovimientoConDetalle, Pendiente } from '@/features/analitica/api'
import {
  cuentasPendientes,
  fmtCompact,
  ivaPorMes,
  porActividad,
  porCampo,
  porPotrero,
  proyeccionFlujo,
  rangoAnterior,
  rangoPeriodo,
  realizadosEnRango,
  resumen,
  resumenIva,
  serieMensualNeto,
} from '@/features/analitica/compute'

// ---------------------------------------------------------------- fixtures

let seq = 0

/** Movimiento con defaults sanos; se sobreescribe sólo lo que el caso necesita. */
function mov(p: Partial<MovimientoConDetalle> = {}): MovimientoConDetalle {
  seq += 1
  return {
    id: `m${seq}`,
    empresa_id: 'e1',
    campo_id: 'c1',
    categoria_id: 'cat1',
    potrero_id: null,
    actividad: null,
    animal_id: null,
    audio_url: null,
    cheque_banco: null,
    cheque_numero: null,
    comprobante_tipo: null,
    comprobante_url: null,
    contraparte: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    cuit_contraparte: null,
    descripcion: null,
    es_echeq: false,
    estado: 'liquidado',
    fecha_devengo: '2026-03-10',
    fecha_cobro_pago: '2026-03-10',
    fecha_vencimiento: null,
    iva_total: null,
    medio_pago: null,
    moneda: 'ARS',
    monto: 1000,
    neto_total: null,
    tipo: 'ingreso',
    categoria: null,
    campo: { nombre: 'La Esperanza' },
    potrero: null,
    ...p,
  } as unknown as MovimientoConDetalle
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

// ------------------------------------------------- 1. devengado vs caja

describe('entra() — las dos verdades de D6', () => {
  it('excluye los anulados en AMBOS modos', () => {
    const movs = [
      mov({ estado: 'anulado', monto: 500 }),
      mov({ estado: 'liquidado', monto: 100 }),
    ]
    expect(resumen(movs, 'devengado').ingresos).toBe(100)
    expect(resumen(movs, 'caja').ingresos).toBe(100)
  })

  it('un pendiente cuenta en devengado pero NO en caja', () => {
    const movs = [mov({ estado: 'pendiente', monto: 700, fecha_cobro_pago: null })]
    expect(resumen(movs, 'devengado').ingresos).toBe(700)
    expect(resumen(movs, 'caja').ingresos).toBe(0)
  })

  it('un liquidado SIN fecha de cobro/pago no puede contar como caja', () => {
    const movs = [mov({ estado: 'liquidado', fecha_cobro_pago: null, monto: 300 })]
    expect(resumen(movs, 'caja').ingresos).toBe(0)
    expect(resumen(movs, 'devengado').ingresos).toBe(300)
  })

  it('resultado = ingresos − gastos', () => {
    const movs = [
      mov({ tipo: 'ingreso', monto: 1000 }),
      mov({ tipo: 'gasto', monto: 400 }),
    ]
    const r = resumen(movs, 'caja')
    expect(r).toEqual({ ingresos: 1000, gastos: 400, resultado: 600 })
  })
})

// ------------------------------------------------- 2. las particiones cierran

describe('particiones — ninguna plata se evapora al partir', () => {
  const movs = [
    mov({ campo_id: 'c1', tipo: 'ingreso', monto: 1000, actividad: 'cria' }),
    mov({ campo_id: 'c2', tipo: 'gasto', monto: 300, actividad: 'invernada' }),
    // sin campo asignado en la relación, sin actividad, sin potrero:
    mov({ campo_id: 'c3', tipo: 'gasto', monto: 250, actividad: null, campo: null }),
  ]

  it('porCampo suma exactamente lo mismo que resumen', () => {
    const total = resumen(movs, 'caja')
    const lineas = porCampo(movs, 'caja')
    expect(sum(lineas.map((l) => l.ingresos))).toBe(total.ingresos)
    expect(sum(lineas.map((l) => l.gastos))).toBe(total.gastos)
  })

  it('porActividad suma lo mismo que resumen (el cubo "sin" recoge los huérfanos)', () => {
    const total = resumen(movs, 'caja')
    const lineas = porActividad(movs, 'caja')
    expect(sum(lineas.map((l) => l.ingresos))).toBe(total.ingresos)
    expect(sum(lineas.map((l) => l.gastos))).toBe(total.gastos)
    expect(lineas.find((l) => l.actividad === 'sin')?.gastos).toBe(250)
  })

  it('porPotrero NO cierra contra el total, y la brecha es exactamente lo no imputado', () => {
    const conPotrero = mov({ potrero_id: 'p1', tipo: 'gasto', monto: 120 })
    const todos = [...movs, conPotrero]
    const total = resumen(todos, 'caja')
    const lineas = porPotrero(todos, 'caja')
    const gastosPotrero = sum(lineas.map((l) => l.gastos))
    // Es intencional (los de nivel campo no se prorratean), pero tiene que ser
    // explicable al peso: la brecha = los movimientos sin potrero_id.
    expect(gastosPotrero).toBe(120)
    expect(total.gastos - gastosPotrero).toBe(550)
  })
})

// ------------------------------------------------- 3. período (zona horaria)

describe('rangoPeriodo — el corte no puede depender de la hora del día', () => {
  // 18/09/2026 a las 21:30 hora Argentina. En UTC ya es el 19.
  const nocheArg = new Date('2026-09-18T21:30:00-03:00')
  const mañanaArg = new Date('2026-09-18T09:00:00-03:00')

  it('"hasta" es HOY en hora local, no mañana en UTC', () => {
    expect(rangoPeriodo('anio', nocheArg).hasta).toBe('2026-09-18')
  })

  it('el mismo día da el mismo rango a la mañana que a la noche', () => {
    expect(rangoPeriodo('12m', nocheArg)).toEqual(rangoPeriodo('12m', mañanaArg))
    expect(rangoPeriodo('anio', nocheArg)).toEqual(rangoPeriodo('anio', mañanaArg))
  })

  it('12m arranca el DÍA 1 del mes, no el 2', () => {
    expect(rangoPeriodo('12m', nocheArg).desde).toBe('2025-10-01')
  })

  it('"anio" arranca el 1 de enero', () => {
    expect(rangoPeriodo('anio', mañanaArg).desde).toBe('2026-01-01')
  })

  it('"todo" no tiene piso', () => {
    expect(rangoPeriodo('todo', mañanaArg).desde).toBeNull()
  })

  // Restarle 11 meses a un día 31 desbordaba al mes siguiente cuando el destino
  // tenía menos días: 31/01 caía en marzo y se perdía febrero entero.
  it('desde un día 31, 12m arranca en el mes correcto (no desborda)', () => {
    const treintaYUno = new Date('2026-01-31T09:00:00-03:00')
    expect(rangoPeriodo('12m', treintaYUno).desde).toBe('2025-02-01')
  })

  it('desde un 29 de febrero bisiesto tampoco desborda', () => {
    const bisiesto = new Date('2028-02-29T09:00:00-03:00')
    expect(rangoPeriodo('12m', bisiesto).desde).toBe('2027-03-01')
  })
})

describe('rangoAnterior — comparable con el actual', () => {
  const hoy = new Date('2026-09-18T09:00:00-03:00')

  it('el período anterior termina justo el día antes del actual', () => {
    const actual = rangoPeriodo('anio', hoy)
    const prev = rangoAnterior('anio', hoy)!
    expect(prev.hasta).toBe('2025-12-31')
    expect(prev.hasta < actual.desde!).toBe(true)
  })

  it('dura lo mismo que el actual (si no, toda variación % es mentira)', () => {
    const actual = rangoPeriodo('anio', hoy)
    const prev = rangoAnterior('anio', hoy)!
    const dias = (a: string, b: string) =>
      Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
    expect(dias(prev.desde, prev.hasta)).toBe(dias(actual.desde!, actual.hasta))
  })

  it('"todo" no tiene período anterior', () => {
    expect(rangoAnterior('todo', hoy)).toBeNull()
  })
})

// ------------------------------------------------- 4. bordes del rango

describe('realizadosEnRango — los bordes entran, lo de afuera no', () => {
  const enRango = (f: string) => mov({ fecha_cobro_pago: f, fecha_devengo: f })

  it('incluye los extremos e excluye lo de afuera por un día', () => {
    const movs = [
      enRango('2026-02-28'), // un día antes
      enRango('2026-03-01'), // borde inferior
      enRango('2026-03-15'),
      enRango('2026-03-31'), // borde superior
      enRango('2026-04-01'), // un día después
    ]
    const out = realizadosEnRango(movs, '2026-03-01', '2026-03-31')
    expect(out.map((m) => m.fecha_cobro_pago)).toEqual([
      '2026-03-01',
      '2026-03-15',
      '2026-03-31',
    ])
  })

  it('sin piso ("todo") toma todo lo anterior a hasta', () => {
    const movs = [enRango('2020-01-01'), enRango('2026-03-15')]
    expect(realizadosEnRango(movs, null, '2026-03-31')).toHaveLength(2)
  })

  it('nunca deja pasar un pendiente, aunque caiga en el rango', () => {
    const movs = [
      mov({ estado: 'pendiente', fecha_cobro_pago: '2026-03-10' }),
    ]
    expect(realizadosEnRango(movs, '2026-03-01', '2026-03-31')).toHaveLength(0)
  })
})

// ------------------------------------------------- 5. IVA

describe('posición de IVA — siempre devengado', () => {
  it('débito sale de las ventas y crédito de las compras', () => {
    const movs = [
      mov({ tipo: 'ingreso', iva_total: 1050, fecha_devengo: '2026-03-05' }),
      mov({ tipo: 'gasto', iva_total: 2100, fecha_devengo: '2026-03-20' }),
    ]
    const r = resumenIva(movs)
    expect(r.debito).toBe(1050)
    expect(r.credito).toBe(2100)
    expect(r.posicion).toBe(-1050) // saldo a favor: el caso crónico del agro
  })

  it('agrupa por fecha de DEVENGO, no por la de cobro', () => {
    const movs = [
      mov({
        tipo: 'ingreso',
        iva_total: 100,
        fecha_devengo: '2026-03-31',
        fecha_cobro_pago: '2026-04-15',
      }),
    ]
    expect(ivaPorMes(movs).map((l) => l.mes)).toEqual(['2026-03'])
  })

  it('un pendiente SÍ genera IVA (el fiscal no espera al cobro)', () => {
    const movs = [
      mov({ estado: 'pendiente', tipo: 'ingreso', iva_total: 210, fecha_cobro_pago: null }),
    ]
    expect(resumenIva(movs).debito).toBe(210)
  })

  it('un anulado no genera IVA', () => {
    const movs = [mov({ estado: 'anulado', tipo: 'ingreso', iva_total: 210 })]
    expect(resumenIva(movs).debito).toBe(0)
  })
})

// ------------------------------------------------- 6. serie mensual

describe('serieMensualNeto — continua, sin saltos de tiempo', () => {
  it('rellena con 0 los meses sin movimientos', () => {
    const movs = [
      mov({ fecha_cobro_pago: '2026-01-10', tipo: 'ingreso', monto: 100 }),
      mov({ fecha_cobro_pago: '2026-04-10', tipo: 'ingreso', monto: 300 }),
    ]
    const serie = serieMensualNeto(movs, '2026-01-01', '2026-04-30')
    expect(serie.map((p) => p.mes)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    expect(serie.map((p) => p.valor)).toEqual([100, 0, 0, 300])
  })

  it('los gastos restan', () => {
    const movs = [
      mov({ fecha_cobro_pago: '2026-01-10', tipo: 'ingreso', monto: 500 }),
      mov({ fecha_cobro_pago: '2026-01-20', tipo: 'gasto', monto: 200 }),
    ]
    expect(serieMensualNeto(movs, '2026-01-01', '2026-01-31')[0].valor).toBe(300)
  })

  it('LATENTE: no debe contar anulados aunque el caller no los filtre', () => {
    const movs = [
      mov({ fecha_cobro_pago: '2026-01-10', tipo: 'ingreso', monto: 500 }),
      mov({ estado: 'anulado', fecha_cobro_pago: '2026-01-15', tipo: 'ingreso', monto: 999 }),
    ]
    expect(serieMensualNeto(movs, '2026-01-01', '2026-01-31')[0].valor).toBe(500)
  })

  it('LATENTE: no debe estirar el gráfico antes del período pedido', () => {
    const movs = [
      mov({ fecha_cobro_pago: '2024-05-10', tipo: 'ingreso', monto: 100 }),
      mov({ fecha_cobro_pago: '2026-01-10', tipo: 'ingreso', monto: 200 }),
    ]
    const serie = serieMensualNeto(movs, '2026-01-01', '2026-01-31')
    expect(serie.map((p) => p.mes)).toEqual(['2026-01'])
  })
})

// ------------------------------------------------- 7. pendientes y flujo

describe('cuentasPendientes / proyeccionFlujo — la bisagra con Agenda', () => {
  it('sólo cuenta lo pendiente, ni liquidado ni anulado', () => {
    const movs = [
      mov({ estado: 'pendiente', tipo: 'ingreso', monto: 1000 }),
      mov({ estado: 'pendiente', tipo: 'gasto', monto: 400 }),
      mov({ estado: 'liquidado', tipo: 'ingreso', monto: 9999 }),
      mov({ estado: 'anulado', tipo: 'gasto', monto: 8888 }),
    ]
    expect(cuentasPendientes(movs)).toEqual({ porCobrar: 1000, porPagar: 400 })
  })

  it('el acumulado del flujo es la suma corrida de los netos', () => {
    const pend: Pendiente[] = [
      { id: '1', campoId: null, descripcion: 'a', tipo: 'ingreso', monto: 1000, fechaVencimiento: '2026-04-10', diasParaVencer: 10 },
      { id: '2', campoId: null, descripcion: 'b', tipo: 'gasto', monto: 400, fechaVencimiento: '2026-04-20', diasParaVencer: 20 },
      { id: '3', campoId: null, descripcion: 'c', tipo: 'gasto', monto: 300, fechaVencimiento: '2026-05-05', diasParaVencer: 35 },
    ]
    const flujo = proyeccionFlujo(pend)
    expect(flujo.map((f) => f.mes)).toEqual(['2026-04', '2026-05'])
    expect(flujo.map((f) => f.neto)).toEqual([600, -300])
    expect(flujo.map((f) => f.acumulado)).toEqual([600, 300])
  })

  it('ignora los pendientes sin fecha de vencimiento', () => {
    const pend: Pendiente[] = [
      { id: '1', campoId: null, descripcion: 'a', tipo: 'ingreso', monto: 1000, fechaVencimiento: null, diasParaVencer: null },
    ]
    expect(proyeccionFlujo(pend)).toEqual([])
  })
})

// ------------------------------------------------- 8. formato

describe('fmtCompact — bordes de escala', () => {
  it('formatea cada escala', () => {
    expect(fmtCompact(50)).toBe('$50')
    expect(fmtCompact(30_000)).toBe('$30k')
    expect(fmtCompact(1_200_000)).toBe('$1,2M')
  })

  it('el signo negativo usa el menos tipográfico', () => {
    expect(fmtCompact(-30_000)).toBe('−$30k')
  })

  it('no debe imprimir "$1000k" al borde del millón', () => {
    expect(fmtCompact(999_500)).not.toBe('$1000k')
  })
})
