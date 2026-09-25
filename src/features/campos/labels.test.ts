import { describe, expect, it } from 'vitest'
import { actividadDeUsos } from './labels'

// La actividad del campo ya no se pregunta: sale de lo que hay en cada potrero.
describe('actividadDeUsos', () => {
  it('sólo hacienda → ganadera', () => {
    expect(actividadDeUsos(['ganadero', 'ganadero'])).toBe('ganadera')
  })
  it('sólo sembrado → agrícola', () => {
    expect(actividadDeUsos(['agricola'])).toBe('agricola')
  })
  it('hacienda y sembrado → mixta, aunque sea un potrero de cada uno', () => {
    expect(actividadDeUsos(['ganadero', 'agricola', 'vacio'])).toBe('mixta')
  })
  it('los vacíos no definen nada', () => {
    expect(actividadDeUsos(['vacio', 'agricola'])).toBe('agricola')
    expect(actividadDeUsos(['vacio'])).toBeNull()
    expect(actividadDeUsos([])).toBeNull()
  })
})
