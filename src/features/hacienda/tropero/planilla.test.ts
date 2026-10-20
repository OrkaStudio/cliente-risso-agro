import { describe, expect, it } from 'vitest'
import { caravanasDeTexto, interpretarSola, leerCsv, leerFecha, leerPlanilla, muestraParaIa, necesitaAyuda, paraGuardar, problemasDe, type Fila, type Hoja } from './planilla'

const potreros = [{ id: 'p11', nombre: '11B' }, { id: 'p4', nombre: '4B' }]
const nada = { visual: new Set<string>(), rfid: new Set<string>() }
const hoja = (filas: Hoja['filas'], nombre = 'Hoja 1'): Hoja[] => [{ nombre, filas }]

describe('la planilla de caravanas', () => {
  it('lee las columnas por los títulos y copia las celdas tal cual', () => {
    const l = leerPlanilla(hoja(leerCsv('Caravana visible;Categoría;Potrero;Electrónica;Nacimiento;Raza\n1161;Ternero;11B;032530055581161;03/02/2026;Angus\n1172;Ternero;11B;;;\n')), potreros)
    expect(l.faltan).toEqual([])
    expect(l.filas.map((f) => [f.fila, f.visual, f.categoria, f.potreroId, f.rfid, f.nacimiento, f.raza])).toEqual([
      [2, '1161', 'ternero', 'p11', '032530055581161', '2026-02-03', 'Angus'],
      [3, '1172', 'ternero', 'p11', '', null, ''],
    ])
    expect(problemasDe(l.filas, nada).size).toBe(0)
    expect(l.columnas.find((c) => c.columna === 'visual')?.titulo).toBe('Caravana visible')
  })

  it('dice qué fila tiene un problema y por qué, sin arreglar nada en silencio', () => {
    const l = leerPlanilla(
      hoja([
        ['Nro', 'Categoría', 'Potrero', 'Chip', 'Nacimiento'],
        ['1051', 'Vaca', '4B', '03253005558105', ''],
        ['2217', 'Vaquillonas', '9B', '', ''],
        ['2218', 'Vaquillona', '', '', ''],
        ['2218', 'Vaquillona', '', '', ''],
        ['3000', 'Burro', '', '', ''],
        ['1040', 'Vaca', '', '', ''],
        ['', 'Vaca', '4B', '', ''],
        ['A-12', 'Vaca', '', '', ''],
        ['1300', 'Vaca', '', '', '31/02/2025'],
        ['1301', 'Vaca', '', '', 'primavera'],
      ]),
      potreros,
    )
    const p = problemasDe(l.filas, { visual: new Set(['1040']), rfid: new Set() })
    expect(l.filas.map((f) => [f.visual, p.get(f.clave) ?? null])).toEqual([
      ['1051', 'La electrónica tiene 14 números (son 15)'],
      ['2217', null],
      ['2218', null],
      ['2218', 'Está dos veces (también en la fila 4)'],
      ['3000', null],
      ['1040', 'Ya está puesta en un animal de tu rodeo'],
      ['', 'Falta el número de caravana'],
      ['A-12', 'La caravana «A-12» tiene letras: dejá sólo el número'],
      ['1300', 'No entendimos la fecha «31/02/2025»'],
      ['1301', 'No entendimos la fecha «primavera»'],
    ])
  })

  it('un potrero con el mismo nombre en dos campos no se elige solo', () => {
    const l = leerPlanilla(hoja([['Caravana', 'Categoría', 'Potrero'], ['1161', 'Vaca', '1A']]), [{ id: 'a', nombre: '1A' }, { id: 'b', nombre: '1A' }])
    expect([l.filas[0]!.potreroId, l.filas[0]!.potreroCandidatos]).toEqual([null, ['a', 'b']])
  })

  it('le devuelve el 0 al chip que Excel guardó como número', () => {
    const l = leerPlanilla(hoja([['Caravana', 'Categoría', 'RFID'], [1161, 'Ternero', 32530055581161]]), potreros)
    expect(l.filas[0]!.rfid).toBe('032530055581161')
    expect(l.filas[0]!.visual).toBe('1161')
  })

  it('encuentra los títulos aunque arriba haya un título o una explicación, y en otra hoja', () => {
    const l = leerPlanilla([{ nombre: 'Portada', filas: [['Establecimiento La Porteña']] }, { nombre: 'Datos', filas: [['Planilla de caravanas'], [], ['Caravana visible', 'Categoría', 'Potrero'], ['1161', 'Ternero', '11B']] }], potreros)
    expect(l.hoja).toBe('Datos')
    expect(l.filas.map((f) => [f.visual, f.fila])).toEqual([['1161', 4]])
  })

  it('avisa si faltan las columnas que hacen falta', () => {
    const l = leerPlanilla(hoja([['Nombre', 'Peso'], ['x', '200']]), potreros)
    expect(l.faltan).toEqual(['la columna de la caravana'])
    expect(necesitaAyuda(l)).toBe(true)
  })

  it('con lo que entendió la IA: columnas, palabras y el orden de la fecha', () => {
    const hojas = hoja([['Id', 'Clase', 'Pot.', 'F. nac'], ['1161', 'Vaq.', 'Pot 11', '02/13/2025']])
    expect(necesitaAyuda(leerPlanilla(hojas, potreros))).toBe(true)
    const l = leerPlanilla(hojas, potreros, {
      ...interpretarSola(hojas),
      columnas: { visual: 0, categoria: 1, potrero: 2, nacimiento: 3 },
      categorias: { 'Vaq.': 'vaquillona' },
      potreros: { 'Pot 11': 'p11' },
      fecha: 'mes_dia_anio',
    })
    expect(l.filas.map((f) => [f.visual, f.categoria, f.potreroId, f.nacimiento])).toEqual([['1161', 'vaquillona', 'p11', '2025-02-13']])
    expect(necesitaAyuda(l)).toBe(false)
    expect(problemasDe(l.filas, nada).size).toBe(0)
  })

  it('las filas escritas a mano también se revisan, y se guardan limpias', () => {
    const mano = (visual: string, rfid = ''): Fila => ({ clave: visual, fila: null, visual, rfid, categoria: 'vaca', categoriaTexto: '', potreroId: 'p4', potreroTexto: '', potreroCandidatos: [], nacimiento: null, nacimientoTexto: '', raza: '' })
    const p = problemasDe([mano('1041'), mano('1041'), mano('1042', '032 5300 5558 1042')], nada)
    expect([...p.values()]).toEqual(['Está dos veces'])
    expect(paraGuardar(mano('1042', '032 5300 5558 1042'))).toEqual({ visual: '1042', rfid: '032530055581042', categoria: 'vaca', potreroId: 'p4', nacimiento: null, raza: null })
  })

  it('a la IA le mostramos una muestra, no la planilla entera', () => {
    const filas = [['Nro', 'Clase'], ...Array.from({ length: 500 }, (_, i) => [String(1000 + i), i % 2 ? 'Vaca' : 'Vaq.'])]
    const [m] = muestraParaIa(hoja(filas))
    expect(m!.primeras).toHaveLength(12)
    expect(m!.valoresPorColumna[0]).toHaveLength(40)
    expect(m!.valoresPorColumna[1]).toEqual(['Clase', 'Vaq.', 'Vaca'])
  })

  it('fechas: las del día, las de Excel y las imposibles', () => {
    expect(leerFecha('3/2/26')).toBe('2026-02-03')
    expect(leerFecha('2026-02-03')).toBe('2026-02-03')
    expect(leerFecha(new Date('2026-02-03T00:00:00Z'))).toBe('2026-02-03')
    expect(leerFecha('30/02/2026')).toBeNull()
  })

  it('el CSV con un título arriba: el separador sale de los renglones con datos', () => {
    expect(leerCsv('Planilla del Dr. Pérez, octubre\n\nNro;Categoría\n7101;Oveja')).toEqual([['Planilla del Dr. Pérez, octubre'], [''], ['Nro', 'Categoría'], ['7101', 'Oveja']])
    expect(leerCsv('1161\t032530055581161\n1162')).toEqual([['1161', '032530055581161'], ['1162']])
  })

  it('de a una o por rango', () => {
    expect(caravanasDeTexto('1161, 1162 1161')).toEqual(['1161', '1162'])
    expect(caravanasDeTexto('0098-0101')).toEqual(['0098', '0099', '0100', '0101'])
  })
})
