import { describe, expect, it, vi } from 'vitest'
import { itemsDe, type Resumen } from '@/features/guia/estado'
import {
  MISIONES,
  misionDeItem,
  proximaMision,
  type Contexto,
} from '@/features/guia/misiones'
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

function ctx(resumen: Resumen, extra: Partial<Contexto> = {}): Contexto {
  return { resumen, pathname: '/campos', dialogoAbierto: false, anclas: new Set(), ...extra }
}

describe('misiones — enseñar haciendo', () => {
  it('recién onboardeado: la próxima es traer el campo al mapa, y la invita con lo suyo', () => {
    const m = proximaMision(RECIEN_ONBOARDEADO)!
    expect(m.id).toBe('campo-en-mapa')
    expect(m.titulo(RECIEN_ONBOARDEADO)).toBe('Traé tu campo al mapa')
    const inv = m.invitacion(RECIEN_ONBOARDEADO)
    expect(inv.pregunta).toBe('¿Traemos La Porteña al mapa?')
    expect(inv.minutos).toBe(2)
    expect(inv.porQue).toContain('ARBA')
  })

  it('campo en Buenos Aires: dos pasos, y cada uno se da por hecho cuando pasó de verdad', () => {
    const pasos = MISIONES['campo-en-mapa'].pasos(RECIEN_ONBOARDEADO)
    expect(pasos.map((p) => p.ancla)).toEqual(['campos-satelital', 'catastro-boton', 'catastro-form'])
    expect(pasos[0]!.ruta).toBe('/campos?campo=c1')
    expect(pasos[1]!.texto.split(' ').length).toBeLessThanOrEqual(12)
    // Paso 0: pasar a la satelital; se salta solo si el catastro ya está en pantalla.
    expect(pasos[0]!.hecho(ctx(RECIEN_ONBOARDEADO))).toBe(false)
    expect(pasos[0]!.hecho(ctx(RECIEN_ONBOARDEADO, { anclas: new Set(['catastro-boton']) }))).toBe(true)
    // Paso 1: se abrió el diálogo.
    expect(pasos[1]!.hecho(ctx(RECIEN_ONBOARDEADO))).toBe(false)
    expect(pasos[1]!.hecho(ctx(RECIEN_ONBOARDEADO, { dialogoAbierto: true }))).toBe(true)
    // Paso 2: el contorno quedó guardado (el campo ya no está sin contorno).
    expect(pasos[2]!.hecho(ctx(RECIEN_ONBOARDEADO, { dialogoAbierto: true }))).toBe(false)
    expect(pasos[2]!.hecho(ctx({ ...RECIEN_ONBOARDEADO, sinContorno: [] }))).toBe(true)
    // Y los anteriores también se saltan si ya se guardó (el productor fue más rápido).
    expect(pasos[1]!.hecho(ctx({ ...RECIEN_ONBOARDEADO, sinContorno: [] }))).toBe(true)
  })

  it('fuera de Buenos Aires se marca a mano: el paso 2 espera el modo "marcando"', () => {
    const r = { ...RECIEN_ONBOARDEADO, sinContorno: [{ id: 'c2', nombre: 'El Bajo', provincia: 'La Pampa' }] }
    const pasos = MISIONES['campo-en-mapa'].pasos(r)
    expect(pasos[1]!.texto).toBe('Tocá «Marcar el contorno».')
    expect(pasos[1]!.hecho(ctx(r, { anclas: new Set(['campos-marcando']) }))).toBe(true)
    expect(pasos[2]!.ancla).toBe('campos-mapa')
  })

  it('con el contorno puesto sigue el primer potrero; dibujado uno, no insiste', () => {
    const conContorno = { ...RECIEN_ONBOARDEADO, sinContorno: [] }
    expect(proximaMision(conContorno)?.id).toBe('primer-potrero')
    const pasos = MISIONES['primer-potrero'].pasos(conContorno)
    expect(pasos[0]!.hecho(ctx(conContorno, { anclas: new Set(['campos-dibujando']) }))).toBe(true)
    expect(pasos[1]!.hecho(ctx({ ...conContorno, potrerosDibujados: 1 }))).toBe(true)
    expect(proximaMision({ ...conContorno, potrerosDibujados: 1 })?.id).toBe('ubicar-hacienda')
  })

  it('ubicar hacienda: sólo con potreros, y termina cuando bajan los sueltos', () => {
    expect(misionDeItem('tropas', { ...RECIEN_ONBOARDEADO, potreros: 0 })).toBeNull()
    const m = misionDeItem('tropas', RECIEN_ONBOARDEADO)!
    expect(m.id).toBe('ubicar-hacienda')
    const pasos = m.pasos(RECIEN_ONBOARDEADO)
    expect(pasos[1]!.hecho(ctx({ ...RECIEN_ONBOARDEADO, sinPotrero: 100 }))).toBe(true)
    expect(m.festejo({ ...RECIEN_ONBOARDEADO, sinPotrero: 0 }).texto).toContain('Toda la hacienda')
  })

  it('todo hecho: no hay misión', () => {
    expect(
      proximaMision({ ...RECIEN_ONBOARDEADO, sinContorno: [], potrerosDibujados: 8, sinPotrero: 0 }),
    ).toBeNull()
    expect(proximaMision(VACIO)).toBeNull()
  })

  it('cada paso dice una línea corta', () => {
    for (const m of Object.values(MISIONES)) {
      for (const p of m.pasos(RECIEN_ONBOARDEADO)) {
        expect(p.texto.length).toBeLessThanOrEqual(90)
      }
    }
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
