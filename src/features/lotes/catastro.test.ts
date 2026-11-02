import { describe, expect, it } from 'vitest'
import { normalizarPartida } from './catastro'

describe('partida de la boleta', () => {
  it('partido y partida como vienen, con o sin ceros y guiones', () => {
    expect(normalizarPartida('58', '146')).toBe('058000146')
    expect(normalizarPartida('058', '000146')).toBe('058000146')
    expect(normalizarPartida('058', '000-146')).toBe('058000146')
  })
  it('el dígito verificador del final se descarta', () => {
    expect(normalizarPartida('058', '0001463')).toBe('058000146')
  })
  it('sin números, o de más, no se busca', () => {
    expect(normalizarPartida('', '146')).toBeNull()
    expect(normalizarPartida('0581', '146')).toBeNull()
    expect(normalizarPartida('058', '12345678')).toBeNull()
  })
})
