import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}))
vi.mock('@/lib/use-is-mobile', () => ({ esViewportMovil: () => true }))

const { registrar, enviar, setEmpresaTelemetria, registrarSesionIniciada, CLAVE_SOPORTE, _reiniciarTelemetria } =
  await import('@/lib/telemetria')
const medicion = await import('@/features/onboarding/medicion')

function almacen(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

type Fila = { nombre: string; props: Record<string, unknown>; empresa_id: string | null; dispositivo: string; sesion_id: string }
const enviadas = (): Fila[] => insert.mock.calls.flatMap((c) => c[0] as Fila[])

beforeEach(() => {
  vi.stubGlobal('sessionStorage', almacen())
  insert.mockReset().mockResolvedValue({ error: null })
  _reiniciarTelemetria()
  medicion._reiniciarMedicion()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('telemetria', () => {
  it('junta los eventos y los manda en un solo lote a los 2 s', async () => {
    registrar('onboarding_iniciado')
    registrar('paso_visto', { paso: 'empresa', indice: 1 })
    expect(insert).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(insert).toHaveBeenCalledTimes(1)
    const [a, b] = enviadas()
    expect(a!.nombre).toBe('onboarding_iniciado')
    expect(b!.props).toEqual({ paso: 'empresa', indice: 1 })
    expect(a!.sesion_id).toBe(b!.sesion_id)
    expect(a!.dispositivo).toBe('movil')
  })

  it('lleva la empresa desde que se conoce', async () => {
    registrar('paso_visto', { paso: 'empresa', indice: 1 })
    setEmpresaTelemetria('emp-1')
    registrar('paso_completado', { paso: 'empresa' })
    await enviar()
    expect(enviadas().map((f) => f.empresa_id)).toEqual([null, 'emp-1'])
  })

  it('si el envío falla, no lanza y descarta', async () => {
    insert.mockRejectedValueOnce(new Error('sin red'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registrar('sesion_iniciada')
    await expect(enviar()).resolves.toBeUndefined()
    insert.mockClear()
    await enviar()
    expect(insert).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('un error de la base (RLS, check) tampoco lanza', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registrar('sesion_iniciada')
    await expect(enviar()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('en una sesión de soporte no emite nada', async () => {
    sessionStorage.setItem(CLAVE_SOPORTE, '1')
    registrar('sesion_iniciada')
    await enviar()
    expect(insert).not.toHaveBeenCalled()
  })

  it('sesion_iniciada una sola vez por pestaña y usuario', async () => {
    registrarSesionIniciada('u1')
    registrarSesionIniciada('u1')
    registrarSesionIniciada('u2')
    await enviar()
    expect(enviadas()).toHaveLength(2)
  })
})

describe('medicion del onboarding', () => {
  it('duracion_ms = desde que se vio el paso', async () => {
    medicion.pasoVisto('campo', 2)
    await vi.advanceTimersByTimeAsync(45_000)
    medicion.pasoCompletado('campo', { ha: 300 })
    await enviar()
    const completado = enviadas().find((f) => f.nombre === 'paso_completado')!
    expect(completado.props).toMatchObject({ paso: 'campo', ha: 300 })
    expect(completado.props.duracion_ms).toBeGreaterThanOrEqual(45_000)
  })

  it('un paso salteado no cuenta además como completado', async () => {
    medicion.pasoVisto('potreros', 3)
    medicion.pasoSalteado('potreros')
    medicion.pasoCompletado('potreros', { cantidad: 0 })
    await enviar()
    expect(enviadas().map((f) => f.nombre)).toEqual(['paso_visto', 'paso_salteado'])
  })

  it('volver a ver el paso habilita completarlo', async () => {
    medicion.pasoVisto('hacienda', 4)
    medicion.pasoSalteado('hacienda')
    medicion.pasoVisto('hacienda', 4)
    medicion.pasoCompletado('hacienda', { cabezas: 10 })
    await enviar()
    expect(enviadas().map((f) => f.nombre)).toContain('paso_completado')
  })

  it('onboarding_iniciado una sola vez por carga (StrictMode)', async () => {
    medicion.onboardingIniciado()
    medicion.onboardingIniciado()
    await vi.advanceTimersByTimeAsync(90_000)
    medicion.onboardingCompletado({ campos: 1, potreros: 2, cabezas: 10, con_alquiler: false })
    await enviar()
    expect(enviadas().filter((f) => f.nombre === 'onboarding_iniciado')).toHaveLength(1)
    const fin = enviadas().find((f) => f.nombre === 'onboarding_completado')!
    expect(fin.props.duracion_total_ms).toBeGreaterThanOrEqual(90_000)
  })

  it('sin inicio en esta página (recargó a mitad), el total queda nulo', async () => {
    medicion.onboardingCompletado({ campos: 1, potreros: 0, cabezas: 0, con_alquiler: false })
    await enviar()
    expect(enviadas()[0]!.props.duracion_total_ms).toBeNull()
  })
})
