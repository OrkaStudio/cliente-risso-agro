import { describe, expect, it, vi } from 'vitest'
import { itemsDe, type Resumen } from '@/features/guia/estado'
import { pasosDe } from '@/features/guia/pasos'
import { pasosRecibimiento } from '@/features/guia/pasos-recibimiento'

// Lo que deja el onboarding v2 en la compu: un campo con localidad pero sin
// contorno, potreros cargados sin dibujar, hacienda sin potrero.
const RECIEN_ONBOARDEADO: Resumen = {
  campos: 1,
  sinContorno: [{ id: 'c1', nombre: 'La Porteña', provincia: 'Buenos Aires' }],
  potreros: 8,
  potrerosDibujados: 0,
  cabezas: 120,
  sinPotrero: 120,
  alquilados: 0,
  alquilerPendiente: [],
  recorridas: 0,
}

const VACIO: Resumen = {
  campos: 0,
  sinContorno: [],
  potreros: 0,
  potrerosDibujados: 0,
  cabezas: 0,
  sinPotrero: 0,
  alquilados: 0,
  alquilerPendiente: [],
  recorridas: 0,
}

describe('itemsDe — el camino con nombres vivos', () => {
  it('recién onboardeado: el contorno es lo primero y cada ítem tiene botón real', () => {
    const items = itemsDe(RECIEN_ONBOARDEADO)
    const pendientes = items.filter((i) => !i.hecho)
    expect(pendientes[0]?.id).toBe('campo')
    expect(pendientes[0]?.titulo).toBe('Traé el contorno')
    expect(pendientes[0]?.ruta).toBe('/campos?campo=c1')
    expect(items.find((i) => i.id === 'potreros')?.titulo).toBe('Dibujá los 8 potreros')
    expect(items.find((i) => i.id === 'hacienda')?.hecho).toBe(true)
    const tropas = items.find((i) => i.id === 'tropas')!
    expect(tropas.titulo).toBe('Ubicá 120 animales sin potrero')
    expect(tropas.accion).toBe('hacienda-ubicar')
    // Todo ítem de Oficina pendiente apunta a una ruta; los de escritorio con
    // herramienta, a un ancla real.
    for (const i of pendientes.filter((i) => !i.movil)) expect(i.ruta).toBeTruthy()
  })

  it('fuera de Buenos Aires no promete catastro: se marca a mano', () => {
    const items = itemsDe({
      ...RECIEN_ONBOARDEADO,
      campos: 2,
      sinContorno: [{ id: 'c2', nombre: 'El Bajo', provincia: 'La Pampa' }],
    })
    const campo = items.find((i) => i.id === 'campo')!
    expect(campo.titulo).toBe('Marcá el contorno de El Bajo')
    expect(campo.cta).toBe('Marcar el contorno')
  })

  it('vacío: habla en futuro, sin números', () => {
    const items = itemsDe(VACIO)
    expect(items.find((i) => i.id === 'campo')?.titulo).toBe('Traé tu campo')
    expect(items.find((i) => i.id === 'potreros')?.titulo).toBe('Cargá los potreros')
    expect(items.find((i) => i.id === 'tropas')?.titulo).toBe('Ubicá las tropas')
    expect(items.some((i) => i.id === 'alquiler')).toBe(false)
  })

  it('con potreros a medio dibujar cuenta los que faltan', () => {
    const items = itemsDe({ ...RECIEN_ONBOARDEADO, potrerosDibujados: 5 })
    expect(items.find((i) => i.id === 'potreros')?.titulo).toBe('Dibujá los 3 potreros que faltan')
    expect(items.find((i) => i.id === 'potreros')?.hecho).toBe(true)
  })

  it('campo alquilado: el ítem existe mientras haya alquilados y se tilda al cargarlo', () => {
    const con = itemsDe({
      ...RECIEN_ONBOARDEADO,
      alquilados: 1,
      alquilerPendiente: [{ id: 'c1', nombre: 'La Porteña' }],
    })
    expect(con.find((i) => i.id === 'alquiler')?.titulo).toBe('Cargá el alquiler de La Porteña')
    expect(con.find((i) => i.id === 'alquiler')?.hecho).toBe(false)
    const hecho = itemsDe({ ...RECIEN_ONBOARDEADO, alquilados: 1, alquilerPendiente: [] })
    expect(hecho.find((i) => i.id === 'alquiler')?.hecho).toBe(true)
  })
})

describe('pasosDe — los recorridos le hablan a lo suyo', () => {
  it('Hacienda con animales sueltos suma el paso de ubicarlos con su botón', () => {
    const pasos = pasosDe('hacienda', RECIEN_ONBOARDEADO)
    expect(pasos[0]?.texto).toContain('Tus 120 cabezas')
    const ubicar = pasos.find((p) => p.ancla === 'hacienda-ubicar')
    expect(ubicar?.accion?.click).toBe('hacienda-ubicar')
  })

  it('Hacienda vacía no promete ubicar nada', () => {
    const pasos = pasosDe('hacienda', VACIO)
    expect(pasos.some((p) => p.ancla === 'hacienda-ubicar')).toBe(false)
    expect(pasos[0]?.texto).toContain('Acá vive el stock')
  })

  it('Campos dice cuántos potreros faltan dibujar', () => {
    const pasos = pasosDe('campos', RECIEN_ONBOARDEADO)
    expect(pasos.find((p) => p.ancla === 'campos-mapa')?.texto).toContain('faltan dibujar 8 potreros')
    expect(pasos.find((p) => p.ancla === 'campos-catastro')?.titulo).toBe('Traé el contorno')
  })

  it('Analítica sólo habla del alquiler cuando falta cargarlo', () => {
    const sin = pasosDe('analitica', RECIEN_ONBOARDEADO)
    expect(sin.some((p) => p.ancla === 'analitica-alquiler')).toBe(false)
    const con = pasosDe('analitica', {
      ...RECIEN_ONBOARDEADO,
      alquilados: 1,
      alquilerPendiente: [{ id: 'c1', nombre: 'La Porteña' }],
    })
    expect(con.find((p) => p.ancla === 'analitica-alquiler')?.titulo).toBe('El alquiler de La Porteña')
  })

  it('sin resumen (sin red) los textos son genéricos y no rompen', () => {
    for (const s of ['inicio', 'hacienda', 'campos', 'agenda', 'analitica'] as const) {
      expect(pasosDe(s, null).length).toBeGreaterThan(0)
    }
  })
})

describe('pasosRecibimiento — dos pasos, con lo que hay', () => {
  it('saluda por el nombre, cuenta lo cargado y apunta al siguiente paso', () => {
    const pasos = pasosRecibimiento(
      { resumen: RECIEN_ONBOARDEADO, items: itemsDe(RECIEN_ONBOARDEADO) },
      'Daniel',
      'Risso Agro',
    )
    expect(pasos).toHaveLength(2)
    expect(pasos[0]?.titulo).toBe('¡Bienvenido, Daniel!')
    expect(pasos[0]?.texto).toBe(
      'Risso Agro ya está: 1 campo, 8 potreros y 120 cabezas. Todo lo que cargaste se corrige desde cada sección; nada quedó fijo.',
    )
    expect(pasos[1]?.titulo).toBe('Lo que sigue: traé el contorno')
    expect(pasos[1]?.accion).toEqual({
      label: 'Traer el contorno',
      click: 'campos-catastro',
      ruta: '/campos?campo=c1',
    })
    // Sin DOM (vitest en node) el ancla no está en pantalla → narración centrada.
    expect(pasos[1]?.ancla).toBeNull()
  })

  it('sin nombre ni empresa saluda igual, y con todo hecho cierra sin CTA', () => {
    const todo: Resumen = {
      campos: 1,
      sinContorno: [],
      potreros: 8,
      potrerosDibujados: 8,
      cabezas: 120,
      sinPotrero: 0,
      alquilados: 0,
      alquilerPendiente: [],
      recorridas: 1,
    }
    const pasos = pasosRecibimiento({ resumen: todo, items: itemsDe(todo) }, null, null)
    expect(pasos[0]?.titulo).toBe('¡Bienvenido!')
    expect(pasos[0]?.texto.startsWith('Tu empresa ya está: 1 campo')).toBe(true)
    expect(pasos[1]?.titulo).toBe('Tu web está lista')
    expect(pasos[1]?.accion).toBeUndefined()
  })

  it('cuando lo que sigue es del celular no ofrece botón', () => {
    const casi: Resumen = {
      campos: 1,
      sinContorno: [],
      potreros: 8,
      potrerosDibujados: 8,
      cabezas: 120,
      sinPotrero: 0,
      alquilados: 0,
      alquilerPendiente: [],
      recorridas: 0,
    }
    const pasos = pasosRecibimiento({ resumen: casi, items: itemsDe(casi) }, 'Ana', null)
    expect(pasos[1]?.titulo).toBe('Lo que sigue: probá la Recorrida')
    expect(pasos[1]?.texto).toContain('desde tu celular')
    expect(pasos[1]?.accion).toBeUndefined()
  })
})

describe('linkWhatsapp — el mensaje ya escrito', () => {
  it('arma el wa.me con quién escribe y desde dónde', async () => {
    vi.stubEnv('VITE_WHATSAPP_SOPORTE', '5492244472369')
    vi.resetModules()
    const { linkWhatsapp } = await import('@/features/guia/whatsapp')
    const url = linkWhatsapp({ nombre: 'Daniel', empresa: 'Risso Agro', seccion: 'Campos' })
    expect(url?.startsWith('https://wa.me/5492244472369?text=')).toBe(true)
    expect(decodeURIComponent(url!.split('text=')[1]!)).toBe(
      'Hola, soy Daniel de Risso Agro. Uso la aplicación de Orka. Estoy en Campos de la aplicación. Tengo una consulta: ',
    )
    vi.unstubAllEnvs()
  })

  it('sin la variable no hay botón', async () => {
    vi.stubEnv('VITE_WHATSAPP_SOPORTE', '')
    vi.resetModules()
    const { linkWhatsapp } = await import('@/features/guia/whatsapp')
    expect(linkWhatsapp({ nombre: null, empresa: null, seccion: null })).toBeNull()
    vi.unstubAllEnvs()
  })
})
