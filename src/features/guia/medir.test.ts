import { describe, expect, it } from 'vitest'
import { nuevosHechos, pantallaDeRuta } from './medir'

describe('pantallaDeRuta', () => {
  it('nombra la pantalla sin ids', () => {
    expect(pantallaDeRuta('/')).toBe('inicio')
    expect(pantallaDeRuta('/hacienda')).toBe('hacienda')
    expect(pantallaDeRuta('/hacienda/46aecc2a-38f3-4444-96d7-d8b291050734')).toBe('hacienda/ficha')
    expect(pantallaDeRuta('/campos/674a5b65')).toBe('campos/detalle')
    expect(pantallaDeRuta('/potrero/c1555e9a')).toBe('potrero/detalle')
    expect(pantallaDeRuta('/campo')).toBe('campo/inicio')
    expect(pantallaDeRuta('/campo/manga')).toBe('campo/manga')
    expect(pantallaDeRuta('/agenda/')).toBe('agenda')
  })
})

describe('nuevosHechos', () => {
  it('la primera lectura es la base: no cuenta lo que ya estaba hecho', () => {
    expect(nuevosHechos(null, new Set(['campo', 'hacienda']))).toEqual([])
  })
  it('cuenta sólo lo que se tildó desde la lectura anterior', () => {
    expect(nuevosHechos(new Set(['hacienda']), new Set(['hacienda', 'campo']))).toEqual(['campo'])
  })
})
