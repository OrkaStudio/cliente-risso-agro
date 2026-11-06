import { describe, expect, it } from 'vitest'
import { nombrePropio, primeraMayuscula } from './texto'

describe('nombres mientras se escriben', () => {
  it('mayúscula al principio de cada palabra', () => {
    expect(nombrePropio('francisco lerra')).toBe('Francisco Lerra')
    expect(nombrePropio('maría josé o\'brien')).toBe('María José O\'Brien')
  })
  it('las partículas van en minúscula, salvo al principio', () => {
    expect(nombrePropio('juan de la torre')).toBe('Juan de la Torre')
    expect(nombrePropio('de la fuente')).toBe('De la Fuente')
  })
  it('escribiendo de a una tecla, las partículas quedan en minúscula', () => {
    let v = ''
    for (const c of 'maria de la torre') v = nombrePropio(v + c)
    expect(v).toBe('Maria de la Torre')
  })
  it('no toca lo demás ni los espacios al escribir', () => {
    expect(nombrePropio('ana ')).toBe('Ana ')
    expect(nombrePropio('MacDonald')).toBe('MacDonald')
  })
  it('un puesto: sólo la primera letra', () => {
    expect(primeraMayuscula('contador de la empresa')).toBe('Contador de la empresa')
  })
})
