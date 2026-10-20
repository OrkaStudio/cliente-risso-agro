import { describe, expect, it } from 'vitest'
import type { PotreroRef } from './asignacion'
import { clasificar, palabrasYLugares, planificar, respuestasIniciales, respuestasVacias, type DelRodeo } from './carga-planilla'
import type { Fila } from './planilla'

const potreros: PotreroRef[] = [
  { id: 'p3', nombre: '3A', campoId: 'c1', campo: 'La Porteña' },
  { id: 'p1', nombre: '1A', campoId: 'c1', campo: 'La Porteña' },
  { id: 'l1', nombre: '1A', campoId: 'c2', campo: 'La Loma' },
]
let n = 0
const fila = (visual: string, x: Partial<Fila> = {}): Fila => ({ clave: `f${++n}`, fila: n, visual, rfid: '', categoria: null, categoriaTexto: '', potreroId: null, potreroTexto: '', potreroCandidatos: [], nacimiento: null, nacimientoTexto: '', raza: '', ...x })
const sinCaravana = (id: string, categoria: DelRodeo['categoria'], potreroId: string): DelRodeo => ({ id, categoria, potreroId, createdAt: id, propio: false, visual: null, rfid: null })
const conCaravana = (id: string, visual: string, rfid: string | null = null): DelRodeo => ({ id, categoria: 'vaca', potreroId: 'p3', createdAt: id, propio: false, visual, rfid })

// El rodeo: 3 vacas y 2 vaquillonas sin caravana en el 3A, 1 toro en el 1A de La Porteña, y la 900 con caravana sin chip.
const rodeo = [sinCaravana('v1', 'vaca', 'p3'), sinCaravana('v2', 'vaca', 'p3'), sinCaravana('v3', 'vaca', 'p3'), sinCaravana('q1', 'vaquillona', 'p3'), sinCaravana('q2', 'vaquillona', 'p3'), sinCaravana('t1', 'toro', 'p1'), conCaravana('c900', '900')]

describe('caravanas por grupos', () => {
  it('lo que se entiende solo y lo que sugiere la IA, marcado para confirmar', () => {
    const fs = [fila('1', { categoriaTexto: 'Vaca', potreroTexto: '3A' }), fila('2', { categoriaTexto: 'Vq', potreroTexto: '3A' }), fila('3', { categoriaTexto: 'Tro', potreroTexto: '1A' })]
    expect(palabrasYLugares(fs, potreros).lugares.find((l) => l.texto === '1A')!.candidatos).toEqual(['p1', 'l1'])
    const { respuestas, sugeridas } = respuestasIniciales(fs, potreros, { categorias: { Vq: 'vaquillona' }, potreros: {} })
    expect(respuestas.que).toEqual({ Vaca: 'vaca', Vq: 'vaquillona', Tro: '' })
    expect(respuestas.donde).toEqual({ '3A': 'p3', '1A': '' }) // el 1A está en dos campos: se pregunta
    expect([...sugeridas]).toEqual(['que:Vq'])
  })

  it('las que ya están se saltean; si les falta el chip, se ofrece sumarlo; un chip ajeno es un error', () => {
    const fs = [fila('900'), fila('1001')]
    const c = clasificar(fs, rodeo)
    expect(fs.map((f) => c.get(f.clave)!.clase)).toEqual(['ya', 'poner'])
    const conChip = fila('900', { rfid: '032530055580900' })
    expect(clasificar([conChip], rodeo).get(conChip.clave)).toEqual({ clase: 'chip', animalId: 'c900' })
    const ajeno = clasificar([fila('1001', { rfid: '032530055580900' })], [conCaravana('c900', '900', '032530055580900')])
    expect([...ajeno.values()][0]).toEqual({ clase: 'error', motivo: 'El chip ya está puesto en la 900' })
  })

  it('con columnas: cada número va a su grupo, con el antes y el después', () => {
    const fs = [fila('1001', { categoriaTexto: 'Vaca', potreroTexto: '3A' }), fila('1002', { categoriaTexto: 'Vaca', potreroTexto: '3A' }), fila('900', { rfid: '032530055580900' })]
    const { respuestas } = respuestasIniciales(fs, potreros)
    const p = planificar(fs, rodeo, potreros, respuestas, true, true)
    expect(p.grupos).toEqual([{ clave: 'p3|vaca', categoria: 'vaca', potreroId: 'p3', antes: 3, despues: 1, numeros: ['1001', '1002'], nuevas: 0 }])
    expect(p.filas.map((f) => [f.visual, f.animalId])).toEqual([['1001', 'v1'], ['1002', 'v2']])
    expect(p.chips).toEqual([{ animalId: 'c900', rfid: '032530055580900' }])
    expect(planificar(fs, rodeo, potreros, { ...respuestas, chip: false }, true, true).chips).toEqual([])
  })

  it('sin columnas: nada se pone hasta decir qué son y dónde estaban', () => {
    const fs = [fila('1001'), fila('1002'), fila('1003'), fila('1004'), fila('1005')]
    const r = respuestasVacias()
    let p = planificar(fs, rodeo, potreros, r, false, false)
    expect([p.faltanQue, p.faltanDonde, p.filas.length]).toEqual([5, 0, 0])
    r.sinQue = { modo: 'varios', uno: '', tramos: [{ desde: '1001', hasta: '1003', categoria: 'vaca' }, { desde: '1004', hasta: '1005', categoria: 'vaquillona' }] }
    p = planificar(fs, rodeo, potreros, r, false, false)
    expect([p.faltanQue, p.faltanDonde]).toEqual([0, 5])
    r.sinDonde = { modo: 'varios', potrero: '', porCategoria: { vaca: 'p3', vaquillona: 'p3' } }
    p = planificar(fs, rodeo, potreros, r, false, false)
    expect(p.grupos.map((g) => [g.categoria, g.antes, g.despues])).toEqual([['vaca', 3, 0], ['vaquillona', 2, 0]])
  })

  it('un grupo que no cierra no se pone hasta decir qué pasó', () => {
    const fs = ['1001', '1002', '1003', '1004'].map((v) => fila(v, { categoriaTexto: 'Vaca', potreroTexto: '3A' }))
    const { respuestas } = respuestasIniciales(fs, potreros)
    const p = planificar(fs, rodeo, potreros, respuestas, true, true)
    expect(p.noCierran).toEqual([{ clave: 'p3|vaca', categoria: 'vaca', potreroId: 'p3', planilla: 4, hay: 3, numeros: ['1001', '1002', '1003', '1004'] }])
    expect(p.filas).toEqual([])

    // Entraron: 3 reciben número y 1 se da de alta.
    const e = planificar(fs, rodeo, potreros, { ...respuestas, noCierra: { 'p3|vaca': { que: 'entraron' } } }, true, true)
    expect([e.filas.length, e.altas.map((a) => [a.visual, a.potreroId, a.categoria])]).toEqual([3, [['1004', 'p3', 'vaca']]])
    expect(e.grupos[0]).toMatchObject({ antes: 3, despues: 0, nuevas: 1 })

    // Estaba en otro potrero: la 1004 va al 1A… donde no hay vacas sin caravana, así que ese grupo no cierra.
    const o = planificar(fs, rodeo, potreros, { ...respuestas, noCierra: { 'p3|vaca': { que: 'otro', desde: '1004', hasta: '1004', potrero: 'p1' } } }, true, true)
    expect(o.filas.length).toBe(3)
    expect(o.noCierran.map((g) => [g.clave, g.planilla, g.hay])).toEqual([['p1|vaca', 1, 0]])

    // Ninguna: el grupo queda afuera, contado.
    const x = planificar(fs, rodeo, potreros, { ...respuestas, noCierra: { 'p3|vaca': { que: 'ninguna' } } }, true, true)
    expect([x.filas.length, x.afuera]).toEqual([0, [{ clave: 'p3|vaca', categoria: 'vaca', potreroId: 'p3', cuantas: 4 }]])
  })
})
