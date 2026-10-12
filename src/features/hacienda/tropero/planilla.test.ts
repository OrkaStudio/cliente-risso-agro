import { describe, expect, it } from 'vitest'
import { caravanasDeTexto, leerCsv, leerPlanilla, PLANILLA_EJEMPLO } from './planilla'

const potreros = [{ id: 'p11', nombre: '11B' }, { id: 'p4', nombre: '4B' }]
const nada = { visual: new Set<string>(), rfid: new Set<string>() }

describe('la planilla de caravanas', () => {
  it('lee la de ejemplo: completas y sin electrónica', () => {
    const l = leerPlanilla(leerCsv(PLANILLA_EJEMPLO), potreros, nada)
    expect(l.faltan).toEqual([])
    expect(l.filas).toBe(3)
    expect(l.completas.map((f) => [f.visual, f.categoria, f.potreroId, f.nacimiento])).toEqual([
      ['1161', 'ternero', 'p11', '2026-02-03'],
      ['1040', 'vaca', 'p11', null],
    ])
    expect(l.sinElectronica.map((f) => f.visual)).toEqual(['1172'])
  })
  it('separa lo que hay que corregir, con la razón', () => {
    const l = leerPlanilla(
      [
        ['Nro', 'Categoría', 'Potrero', 'Chip'],
        ['1051', 'Vaca', '4B', '03253005558105'],
        ['2217', 'Vaquillonas', '9B', ''],
        ['2218', 'Vaquillona', '', ''],
        ['2218', 'Vaquillona', '', ''],
        ['3000', 'Burro', '', ''],
        ['1040', 'Vaca', '', ''],
      ],
      potreros,
      { visual: new Set(['1040']), rfid: new Set() },
    )
    expect(l.paraCorregir.map((p) => [p.caravana, p.problema])).toEqual([
      ['1051', 'La electrónica tiene 14 dígitos (son 15)'],
      ['2217', 'No hay un potrero «9B»'],
      ['2218', 'Está dos veces (también en la fila 4)'],
      ['3000', 'No conocemos la categoría «Burro»'],
      ['1040', 'Ya está puesta en un animal de tu rodeo'],
    ])
    expect(l.sinElectronica.map((f) => f.visual)).toEqual(['2218'])
  })
  it('avisa si faltan las columnas que hacen falta', () => {
    expect(leerPlanilla([['Nombre', 'Peso'], ['x', '200']], potreros, nada).faltan).toEqual(['Caravana visible', 'Categoría'])
  })
  it('de a una o por rango', () => {
    expect(caravanasDeTexto('1161, 1162 1161')).toEqual(['1161', '1162'])
    expect(caravanasDeTexto('0098-0101')).toEqual(['0098', '0099', '0100', '0101'])
  })
})
