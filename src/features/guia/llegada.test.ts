import { describe, expect, it, vi } from 'vitest'
import { itemsDe, type Resumen } from '@/features/guia/estado'
import { saludo } from '@/features/guia/saludo'

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
    expect(pendientes[0]?.ruta).toBe('/campos')
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

describe('saludo — corto y con lo suyo', () => {
  it('nombre, empresa y lo cargado', () => {
    expect(saludo('Daniel', 'Risso Agro', RECIEN_ONBOARDEADO)).toBe(
      'Hola, Daniel. Risso Agro ya está: 1 campo, 8 potreros y 120 cabezas.',
    )
  })
  it('sin nombre ni empresa ni datos', () => {
    expect(saludo(null, null, VACIO)).toBe('Hola. Tu empresa ya está.')
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
