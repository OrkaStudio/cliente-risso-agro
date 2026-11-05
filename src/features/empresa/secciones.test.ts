import { describe, expect, it } from 'vitest'
import { primeraRuta, puedeVer, seccionDeRuta, veePlata } from './secciones'
import type { Membresia } from './use-empresa'

const m = (rol: string, secciones: string[] | null): Membresia => ({ empresa_id: 'e', rol, secciones, empresa: null })

describe('qué ve cada uno', () => {
  it('el dueño ve todo', () => {
    expect(puedeVer(m('dueno', null), 'plata')).toBe(true)
    expect(veePlata(m('dueno', null))).toBe(true)
  })
  it('un invitado ve sólo lo que le eligió el dueño', () => {
    const peon = m('peon', ['inicio', 'hacienda'])
    expect(puedeVer(peon, 'hacienda')).toBe(true)
    expect(puedeVer(peon, 'campos')).toBe(false)
    expect(veePlata(peon)).toBe(false)
    expect(veePlata(m('encargado', ['agenda']))).toBe(true)
  })
  it('una membresía vieja sin secciones no esconde nada (la base igual niega la plata)', () => {
    expect(puedeVer({ empresa_id: 'e', rol: 'peon', empresa: null }, 'campos')).toBe(true)
  })
  it('lo que no ve lleva a su primera sección', () => {
    expect(primeraRuta(m('vet', ['hacienda']))).toBe('/hacienda')
    expect(primeraRuta(m('peon', ['inicio', 'hacienda']))).toBe('/')
  })
  it('cada ruta es de su sección; Configuración no es de ninguna', () => {
    expect(seccionDeRuta('/')).toBe('inicio')
    expect(seccionDeRuta('/analitica/movimientos')).toBe('plata')
    expect(seccionDeRuta('/hacienda/123')).toBe('hacienda')
    expect(seccionDeRuta('/campo/plata')).toBe('plata')
    expect(seccionDeRuta('/configuracion')).toBeNull()
    expect(seccionDeRuta('/campo/manga')).toBeNull()
  })
})
