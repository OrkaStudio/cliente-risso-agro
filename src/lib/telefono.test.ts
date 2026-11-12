import { describe, expect, it } from 'vitest'
import { formatearCelularAR, formatearMientrasEscribe, normalizarCelularAR, prefijosSacados, queFaltaCelular } from './telefono'

describe('celulares argentinos', () => {
  it('se muestran como en las pantallas de Troppero', () => {
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
  it('escribiendo de a una tecla con 0 y 15, queda bien', () => {
    let v = ''
    for (const c of '02244 15 429015') v = formatearMientrasEscribe(v + c)
    expect(v).toBe('2244 42-9015')
    v = ''
    for (const c of '011 15 5555 4444') v = formatearMientrasEscribe(v + c)
    expect(v).toBe('11 5555-4444')
  })
  it('dice qué prefijos se sacaron, para avisarlo', () => {
    expect(prefijosSacados('011 15 5555')).toEqual(['0', '15'])
    expect(prefijosSacados('02244')).toEqual(['0'])
    expect(prefijosSacados('2244 42')).toEqual([])
  })
  it('el 15 puesto adelante de todo se saca y se avisa (QA 10/11)', () => {
    expect(normalizarCelularAR('152240000007')).toBe('+5492240000007')
    expect(normalizarCelularAR('0152240000007')).toBe('+5492240000007')
    expect(prefijosSacados('152240000007')).toEqual(['15'])
    expect(prefijosSacados('0152240000007')).toEqual(['0', '15'])
    expect(queFaltaCelular('2240')).toBe('Faltan 6 números: un celular tiene 10 sin el +54 9.')
    expect(queFaltaCelular('2240000007')).toBeNull()
  })
  it('rechaza números incompletos o que no son argentinos', () => {
    expect(normalizarCelularAR('2241 55-882')).toBeNull()
    expect(normalizarCelularAR('5241558820')).toBeNull()
  })
})
