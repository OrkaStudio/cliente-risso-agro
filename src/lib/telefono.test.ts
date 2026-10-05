import { describe, expect, it } from 'vitest'
import { formatearCelularAR, formatearMientrasEscribe, normalizarCelularAR } from './telefono'

describe('celulares argentinos', () => {
  it('se muestran como en las pantallas de Tropero', () => {
    expect(formatearMientrasEscribe('2241558820')).toBe('2241 55-8820')
    expect(formatearMientrasEscribe('3511234567')).toBe('351 123-4567')
    expect(formatearMientrasEscribe('1155554444')).toBe('11 5555-4444')
    expect(formatearCelularAR('+5492241558820')).toBe('+54 9 2241 55-8820')
  })
  it('mientras se escribe, el guion aparece cuando hace falta', () => {
    expect(formatearMientrasEscribe('2241')).toBe('2241')
    expect(formatearMientrasEscribe('22415')).toBe('2241 5')
    expect(formatearMientrasEscribe('224155')).toBe('2241 55')
    expect(formatearMientrasEscribe('2241558')).toBe('2241 55-8')
  })
  it('limpia lo que viene pegado de WhatsApp o con 0 y 15', () => {
    expect(formatearMientrasEscribe('+54 9 2241 55-8820')).toBe('2241 55-8820')
    expect(formatearMientrasEscribe('02241 15 558820')).toBe('2241 55-8820')
    expect(normalizarCelularAR('2241 55-8820')).toBe('+5492241558820')
    expect(normalizarCelularAR('02241 15 558820')).toBe('+5492241558820')
  })
  it('rechaza números incompletos o que no son argentinos', () => {
    expect(normalizarCelularAR('2241 55-882')).toBeNull()
    expect(normalizarCelularAR('5241558820')).toBeNull()
  })
})
