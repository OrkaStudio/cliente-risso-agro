import { describe, expect, it } from 'vitest'
import { asignar, filasDelRango, rangos, type PotreroRef, type SinCaravana } from './asignacion'
import type { Fila } from './planilla'

const potreros: PotreroRef[] = [
  { id: 'p3a', nombre: '3A', campoId: 'c1', campo: 'La Porteña' },
  { id: 'p1a', nombre: '1A', campoId: 'c1', campo: 'La Porteña' },
  { id: 'p1aLoma', nombre: '1A', campoId: 'c2', campo: 'La Loma' },
]
let n = 0
const fila = (visual: string, x: Partial<Fila> = {}): Fila => ({
  clave: `f${++n}`,
  fila: n + 1,
  visual,
  rfid: '',
  categoria: 'vaca',
  categoriaTexto: 'Vaca',
  potreroId: 'p3a',
  potreroTexto: '3A',
  potreroCandidatos: [],
  nacimiento: null,
  nacimientoTexto: '',
  raza: '',
  ...x,
})
const animal = (id: string, x: Partial<SinCaravana> = {}): SinCaravana => ({ id, categoria: 'vaca', potreroId: 'p3a', createdAt: `2026-10-0${id.length}`, propio: false, ...x })
const sinErrores = new Map<string, string>()

describe('a qué animal va cada número', () => {
  it('cada número a un animal distinto del grupo exacto', () => {
    const fs = [fila('1041'), fila('1042')]
    const { porFila, grupos } = asignar(fs, [animal('a'), animal('bb'), animal('ccc', { potreroId: 'p1a' })], sinErrores, potreros)
    expect(fs.map((f) => porFila.get(f.clave))).toEqual([
      { estado: 'lista', motivo: null, animalId: 'a' },
      { estado: 'lista', motivo: null, animalId: 'bb' },
    ])
    expect(grupos.map((g) => [g.potreroId, g.categoria, g.disponibles, g.entra])).toEqual([['p3a', 'vaca', 2, true]])
  })

  it('si el grupo no alcanza, no entra ninguno: no se reparte solo', () => {
    const fs = [fila('1041'), fila('1042'), fila('1043')]
    const { porFila } = asignar(fs, [animal('a'), animal('bb')], sinErrores, potreros)
    expect(fs.map((f) => porFila.get(f.clave)!.estado)).toEqual(['no_entra', 'no_entra', 'no_entra'])
    expect(porFila.get(fs[0]!.clave)!.motivo).toBe('La planilla trae 3 vacas para el 3A, La Porteña y ahí hay 2 sin caravana')
  })

  it('si no hay de esa categoría, lo dice; los que tienen datos propios van desde su ficha', () => {
    const f = fila('2001', { categoria: 'toro' })
    const toros = [animal('t1', { categoria: 'toro', propio: true }), animal('t2', { categoria: 'toro', propio: true })]
    expect(asignar([f], toros, sinErrores, potreros).porFila.get(f.clave)).toEqual({
      estado: 'no_entra',
      motivo: 'En el 3A, La Porteña no hay toros sin caravana (hay 2 con datos propios: van desde su ficha)',
      animalId: null,
    })
    const g = fila('2002', { categoria: 'novillo' })
    expect(asignar([g], [], sinErrores, potreros).porFila.get(g.clave)!.motivo).toBe('En el 3A, La Porteña no hay novillos sin caravana')
  })

  it('si en ese potrero hay uno solo, va a ése aunque tenga datos propios: no hay a quién más', () => {
    const f = fila('2001', { categoria: 'toro' })
    expect(asignar([f], [animal('t', { categoria: 'toro', propio: true })], sinErrores, potreros).porFila.get(f.clave)).toEqual({ estado: 'lista', motivo: null, animalId: 't' })
  })

  it('sin potrero y sin ninguno de esa categoría en ningún lado: lo dice, no pregunta dónde', () => {
    const f = fila('2003', { categoria: 'toro', potreroId: null, potreroTexto: '' })
    expect(asignar([f], [animal('a')], sinErrores, potreros).porFila.get(f.clave)).toEqual({
      estado: 'no_entra',
      motivo: 'No hay toros sin caravana en ningún campo: si entraron, sumalos con «Entraron»',
      animalId: null,
    })
  })

  it('lo que la planilla no dice queda para que lo diga el productor', () => {
    const sinQue = fila('1', { categoria: null, categoriaTexto: '' })
    const raro = fila('2', { categoria: null, categoriaTexto: 'Vq' })
    const sinDonde = fila('3', { potreroId: null, potreroTexto: '' })
    const noExiste = fila('4', { potreroId: null, potreroTexto: '9Z' })
    const repetido = fila('5', { potreroId: null, potreroTexto: '1A', potreroCandidatos: ['p1a', 'p1aLoma'] })
    const { porFila } = asignar([sinQue, raro, sinDonde, noExiste, repetido], [animal('a')], sinErrores, potreros)
    expect([sinQue, raro, sinDonde, noExiste, repetido].map((f) => [porFila.get(f.clave)!.estado, porFila.get(f.clave)!.motivo])).toEqual([
      ['falta_que', 'La planilla no dice qué es'],
      ['falta_que', 'No sabemos qué es «Vq»'],
      ['falta_donde', 'La planilla no dice dónde está'],
      ['falta_donde', 'No hay un potrero «9Z»'],
      ['falta_donde', 'Hay un «1A» en La Porteña y La Loma: ¿en cuál?'],
    ])
  })

  it('una fila con error en el número no ocupa un animal', () => {
    const mal = fila('A-1')
    const bien = fila('1042')
    const { porFila } = asignar([mal, bien], [animal('a')], new Map([[mal.clave, 'tiene letras']]), potreros)
    expect(porFila.get(mal.clave)!.estado).toBe('error')
    expect(porFila.get(bien.clave)).toEqual({ estado: 'lista', motivo: null, animalId: 'a' })
  })

  it('los números en rangos y las filas de un rango', () => {
    expect(rangos(['1041', '1042', '1043', '1050', '1052', '1053'])).toBe('1041 a 1043, 1050, 1052, 1053')
    const fs = [fila('1001'), fila('1015'), fila('1031'), fila('', { rfid: '032530055581020' })]
    expect(filasDelRango(fs, '1001', '1030')).toEqual([fs[0]!.clave, fs[1]!.clave])
  })
})
