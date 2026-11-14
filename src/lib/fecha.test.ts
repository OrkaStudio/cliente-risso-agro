import { afterEach, describe, expect, it, vi } from 'vitest'
import { enDiasLocal, hoyLocal, ymd } from './fecha'

// Corre con TZ=America/Argentina/Buenos_Aires (script de vitest): con TZ=UTC
// el bug no se reproduce y el test pasaría en falso.
describe('fechas en hora local', () => {
  afterEach(() => vi.useRealTimers())

  it('a las 22:30 de Argentina, hoy sigue siendo hoy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 22, 30)) // 30/09 22:30 local
    expect(hoyLocal()).toBe('2026-09-30')
  })

  it('suma días sin pasar por UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 0))
    expect(enDiasLocal(30)).toBe('2026-10-30')
  })

  it('ymd rellena mes y día', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
