import { beforeEach, describe, expect, it, vi } from 'vitest'

const registrar = vi.fn()
vi.mock('@/lib/telemetria', () => ({ registrar: (...a: unknown[]) => registrar(...a) }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))

const store = await import('./guia-store')

const nombres = () => registrar.mock.calls.map((c) => c[0])

describe('telemetría de misiones', () => {
  beforeEach(() => {
    store.pararMision()
    registrar.mockClear()
  })

  it('completada: iniciada → pasos → completada, sin abandono al cerrar', () => {
    store.empezarMision('campo-en-mapa', 'bienvenida')
    store.avanzoPasoMision(0, 'a') // el arranque no es un paso
    store.avanzoPasoMision(1, 'b')
    store.terminoMision()
    store.pararMision()
    expect(nombres()).toEqual(['mision_iniciada', 'mision_paso', 'mision_completada'])
    expect(registrar.mock.calls[0]![1]).toEqual({ mision: 'campo-en-mapa', origen: 'bienvenida' })
  })

  it('"Después" antes del festejo es un abandono, con el paso en que estaba', () => {
    store.empezarMision('primer-potrero', 'pastilla')
    store.avanzoPasoMision(2, 'c')
    store.pararMision()
    expect(nombres()).toEqual(['mision_iniciada', 'mision_paso', 'mision_abandonada'])
    expect(registrar.mock.calls[2]![1]).toMatchObject({ mision: 'primer-potrero', indice: 2 })
  })

  it('empezar otra misión cierra la anterior como abandonada', () => {
    store.empezarMision('campo-en-mapa', 'asistente')
    store.empezarMision('ubicar-hacienda', 'pastilla')
    expect(nombres()).toEqual(['mision_iniciada', 'mision_abandonada', 'mision_iniciada'])
  })
})
