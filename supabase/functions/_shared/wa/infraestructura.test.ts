import { describe, expect, it } from 'vitest'
import { bordeCompartido, comandoInfra, contorno, elementoDeTexto, largo, medio, metros, nombreElemento, pegarAlBorde, potreroCercano, potrerosDeElemento, potrerosEnPunto } from './infraestructura.ts'
import type { PotreroDibujado } from './resolver.ts'

// Dos potreros vecinos de ~1 km: el 8B al oeste y el 9B al este, comparten el borde lng = -59.29.
const P8: PotreroDibujado = { id: 'p8', nombre: '8B', campoId: 'c', campo: 'La Porteña', poligono: [[-36, -59.30], [-36, -59.29], [-36.01, -59.29], [-36.01, -59.30]] }
const P9: PotreroDibujado = { id: 'p9', nombre: '9B', campoId: 'c', campo: 'La Porteña', poligono: [[-36, -59.29], [-36, -59.28], [-36.01, -59.28], [-36.01, -59.29]] }
const potreros = [P8, P9]

describe('qué es, a partir de lo que dicen', () => {
  it.each([
    ['tanque australiano', 'tanque', 'australiano'],
    ['Acá hay un molino', 'molino', null],
    ['boyero del casco', 'energizador', 'del casco'],
    ['Portón', 'tranquera', null],
    ['bebedero grande', 'bebedero', 'grande'],
  ])('«%s» → %s', (t, tipo, apodo) => expect(elementoDeTexto(t)).toEqual({ tipo, apodo }))
  const noSon = ['el tanque está vacío', 'tanque lleno', 'molino roto', 'el bebedero no tiene agua', 'vi vacas en el 7B', 'eléctrico']
  it.each(noSon)('«%s» no es una carga de inventario', t => expect(elementoDeTexto(t)).toBeNull())
})

describe('comandos de eléctrico y bajas', () => {
  it('eléctrico entre dos potreros', () => expect(comandoInfra('El eléctrico va entre el 8B y el 9B')).toEqual({ k: 'electrico_entre', a: '8b', b: '9b' }))
  it('eléctrico entre números', () => expect(comandoInfra('eléctrico entre el 8 y el 9')).toEqual({ k: 'electrico_entre', a: '8', b: '9' }))
  it('eléctrico alrededor', () => expect(comandoInfra('eléctrico alrededor del 11B')).toEqual({ k: 'electrico_contorno', p: '11b' }))
  it('un reporte de falla no es un comando de carga', () => expect(comandoInfra('el eléctrico entre el 8 y el 9 está cortado')).toBeNull())
  it('borrar por potrero', () => expect(comandoInfra('borrá el tanque del 9B')).toEqual({ k: 'borrar', tipo: 'tanque', potreros: ['9b'], apodo: null }))
  it('borrar entre dos potreros', () => expect(comandoInfra('Sacá la tranquera entre el 5B y el 8B')).toEqual({ k: 'borrar', tipo: 'tranquera', potreros: ['5b', '8b'], apodo: null }))
  it('borrar con apodo', () => expect(comandoInfra('borrar el molino viejo del 9B')).toEqual({ k: 'borrar', tipo: 'molino', potreros: ['9b'], apodo: 'viejo' }))
  it('texto común no es comando', () => expect(comandoInfra('en el 9B hay poca agua')).toBeNull())
})

describe('geometría', () => {
  it('un punto adentro es de su potrero; sobre el alambrado, de los dos', () => {
    expect(potrerosEnPunto([-36.005, -59.285], potreros).map(p => p.nombre)).toEqual(['9B'])
    expect(potrerosEnPunto([-36.005, -59.2901], potreros).map(p => p.nombre)).toEqual(['8B', '9B'])
  })
  it('la tranquera se pega al alambrado cercano y no se mueve si está lejos', () => {
    const pegado = pegarAlBorde([-36.005, -59.2903], potreros)
    expect(Math.abs(pegado[1] + 59.29)).toBeLessThan(1e-9)
    expect(pegarAlBorde([-36.005, -59.285], potreros)).toEqual([-36.005, -59.285])
  })
  it('borde compartido: el lado común, ordenado y de ~1,1 km', () => {
    const b = bordeCompartido(P8, P9)!
    expect(b).toHaveLength(2)
    expect(b.every(p => p[1] === -59.29)).toBe(true)
    expect(largo(b)).toBeGreaterThan(1000)
    expect(largo(b)).toBeLessThan(1200)
  })
  it('potreros que no se tocan no tienen borde', () => {
    const lejos: PotreroDibujado = { ...P9, id: 'x', poligono: P9.poligono.map(([a, b]) => [a - 0.05, b] as [number, number]) }
    expect(bordeCompartido(P8, lejos)).toBeNull()
  })
  it('contorno cerrado y medio sobre la línea', () => {
    const c = contorno(P9)
    expect(c[0]).toEqual(c[c.length - 1])
    const m = medio([[-36, -59.29], [-36.01, -59.29]])
    expect(metros(m, [-36.005, -59.29])).toBeLessThan(1)
  })
  it('un eléctrico sobre el borde pertenece a los dos potreros', () => {
    expect(potrerosDeElemento({ lat: 0, lng: 0, linea: bordeCompartido(P8, P9) }, potreros).map(p => p.nombre)).toEqual(['8B', '9B'])
  })
  it('algo cerca del campo (el casco) toma el potrero más cercano; muy lejos, ninguno', () => {
    expect(potreroCercano([-36.012, -59.285], potreros)?.nombre).toBe('9B')
    expect(potreroCercano([-36.5, -59.285], potreros)).toBeNull()
  })
})

describe('nombres', () => {
  it.each([
    [['tanque', 'australiano', ['9B']], 'tanque australiano del 9B'],
    [['tranquera', null, ['5B', '8B']], 'tranquera entre el 5B y el 8B'],
    [['energizador', 'del casco', ['6B']], 'energizador del casco'],
    [['electrico', null, ['8B', '9B']], 'eléctrico entre el 8B y el 9B'],
  ] as const)('%j → %s', ([tipo, apodo, ps], nombre) => expect(nombreElemento(tipo, apodo, [...ps])).toBe(nombre))
})
