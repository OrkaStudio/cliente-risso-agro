import { describe, expect, it } from 'vitest'
import { nivelDe, primeraRuta, puedeCargar, puedeVer, resumenNiveles, seccionDeRuta, veePlata, type Niveles } from './secciones'
import type { Membresia } from './use-empresa'

const m = (rol: string, niveles: Niveles | null): Membresia => ({ empresa_id: 'e', rol, niveles, empresa: null })

describe('qué ve y qué carga cada uno (permisos, 13/11)', () => {
  it('el dueño ve y carga todo', () => {
    expect(puedeVer(m('dueno', null), 'plata')).toBe(true)
    expect(puedeCargar(m('dueno', null), 'hacienda')).toBe(true)
    expect(veePlata(m('dueno', null))).toBe(true)
  })
  it('cada nivel: no ve, ve, ve y carga, solo manda', () => {
    const p = m('peon', { hacienda: 'carga', campos: 've', plata: 'solo_manda' })
    expect(puedeVer(p, 'hacienda') && puedeCargar(p, 'hacienda')).toBe(true)
    expect(puedeVer(p, 'campos')).toBe(true)
    expect(puedeCargar(p, 'campos')).toBe(false)
    // «Solo manda» carga por WhatsApp: en la app no ve ni carga.
    expect(puedeVer(p, 'plata')).toBe(false)
    expect(puedeCargar(p, 'plata')).toBe(false)
    expect(nivelDe(p, 'plata')).toBe('solo_manda')
  })
  it('la Agenda va con la Plata', () => {
    expect(puedeVer(m('contador', { plata: 've' }), 'agenda')).toBe(true)
    expect(puedeVer(m('peon', { plata: 'no' }), 'agenda')).toBe(false)
  })
  it('una sección sin nivel elegido es «no ve»', () => {
    expect(puedeVer(m('vet', { hacienda: 'carga' }), 'campos')).toBe(false)
  })
  it('una membresía vieja sin niveles no esconde nada (la base igual niega lo que no corresponde)', () => {
    expect(puedeVer({ empresa_id: 'e', rol: 'peon', empresa: null }, 'campos')).toBe(true)
  })
  it('el Inicio lo tienen todos, así que es la primera sección de cualquiera', () => {
    expect(puedeVer(m('vet', { hacienda: 've' }), 'inicio')).toBe(true)
    expect(primeraRuta(m('vet', { hacienda: 've' }))).toBe('/')
  })
  it('lo que va a poder hacer, en una frase', () => {
    expect(resumenNiveles({ hacienda: 'carga', campos: 've', plata: 'no' })).toBe('Ve y carga la Hacienda y ve los Campos. No ve la Plata y la Agenda.')
    expect(resumenNiveles({ hacienda: 'no', campos: 'solo_manda', plata: 'solo_manda' })).toBe('Manda por WhatsApp lo de los Campos y la Plata y la Agenda. No ve la Hacienda.')
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
