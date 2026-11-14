import { describe, expect, it } from 'vitest'
import {
  bordeDesdePotreros,
  lejosDelAlta,
  campoPendiente,
  candidatos,
  compararBorde,
  estadoDe,
  fueraDelBorde,
  haRedondo,
  hectareasDe,
  nadaUbicado,
  pisaA,
  preseleccion,
  type CampoMapa,
  type LatLng,
  type PotreroMapa,
} from './reglas'

// Un cuadrado de lado `km` kilómetros con la esquina en (lat, lng), cerca de Chascomús.
function cuadrado(km: number, lat = -35.5, lng = -58.0): LatLng[] {
  const dLat = km / 111.32
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return [
    [lat, lng],
    [lat, lng + dLng],
    [lat + dLat, lng + dLng],
    [lat + dLat, lng],
  ]
}

const potrero = (id: string, hectareas: number, extra: Partial<PotreroMapa> = {}): PotreroMapa => ({
  id,
  nombre: id,
  hectareas,
  poligono: null,
  cabezas: 0,
  que: '',
  ...extra,
})

const campo = (extra: Partial<CampoMapa> = {}): CampoMapa => ({
  id: 'c1',
  nombre: 'La Porteña',
  provincia: 'Buenos Aires',
  lat: -35.5,
  lon: -58,
  hectareas: 353,
  contorno: null,
  potreros: [],
  ...extra,
})

describe('medir', () => {
  it('un cuadrado de 1 km mide 100 ha', () => {
    expect(hectareasDe(cuadrado(1))).toBeCloseTo(100, 0)
    expect(hectareasDe(cuadrado(1).slice(0, 2))).toBe(0)
  })
  it('se redondea como se dice', () => {
    expect(haRedondo(312.4)).toBe(312)
    expect(haRedondo(4.26)).toBe(4.3)
  })
})

describe('el borde contra el alta', () => {
  it('dice si coincide, quedó adentro o afuera, o es muy distinto', () => {
    expect(compararBorde(351, 353)).toBe('coincide')
    expect(compararBorde(312, 353)).toBe('adentro')
    expect(compararBorde(380, 353)).toBe('afuera')
    expect(compararBorde(1015, 100)).toBe('muy-distinto')
    expect(compararBorde(50, null)).toBe('sin-alta')
  })
})

describe('dibujos que se pisan o se salen', () => {
  it('detecta un potrero encima de otro', () => {
    const a = potrero('1A', 100, { poligono: cuadrado(1) })
    expect(pisaA(cuadrado(1, -35.5, -57.995), [a])?.id).toBe('1A')
    expect(pisaA(cuadrado(1, -35.52, -57.95), [a])).toBeNull()
  })
  it('mide cuánto queda afuera del borde', () => {
    const borde = cuadrado(2)
    expect(fueraDelBorde(cuadrado(1), borde)).toBeCloseTo(0, 2)
    expect(fueraDelBorde(cuadrado(1, -35.6, -58.2), borde)).toBeCloseTo(1, 2)
  })
})

describe('qué potrero es', () => {
  const faltan = [potrero('11B', 115), potrero('8B', 45), potrero('9B', 40), potrero('10B', 33)]
  it('ordena por tamaño parecido y preselecciona si hay uno solo', () => {
    const cs = candidatos(faltan, 116)
    expect(cs.map((c) => c.id)).toEqual(['11B', '8B', '9B', '10B'])
    expect(cs[0]!.parecido).toBe(true)
    expect(preseleccion(cs)).toBe('11B')
  })
  it('con dos de tamaño parecido, que elija', () => {
    const cs = candidatos(faltan, 41)
    expect(cs.filter((c) => c.parecido).map((c) => c.id)).toEqual(['9B', '8B'])
    expect(preseleccion(cs)).toBeNull()
  })
  it('ninguno parecido: no elige por el productor', () => {
    expect(preseleccion(candidatos(faltan, 400))).toBeNull()
  })
  it('si queda uno solo, es ése', () => {
    expect(preseleccion(candidatos([potrero('2A', 40)], 233))).toBe('2A')
  })
})

describe('dónde se retoma', () => {
  it('el estado de cada campo', () => {
    expect(estadoDe(campo()).tipo).toBe('sin-borde')
    expect(estadoDe(campo({ contorno: cuadrado(2) })).tipo).toBe('sin-potreros')
    const conUno = campo({ contorno: cuadrado(2), potreros: [potrero('1A', 50), potrero('2A', 50, { poligono: cuadrado(0.5) })] })
    const e = estadoDe(conUno)
    expect(e.tipo === 'faltan' && e.faltan.map((p) => p.id)).toEqual(['1A'])
    expect(estadoDe(campo({ contorno: cuadrado(2), potreros: [potrero('1A', 50, { poligono: cuadrado(0.5) })] })).tipo).toBe('listo')
  })
  it('sigue por el primer campo que no está listo', () => {
    const listo = campo({ id: 'a', contorno: cuadrado(1), potreros: [potrero('1A', 100, { poligono: cuadrado(1) })] })
    const falta = campo({ id: 'b' })
    expect(campoPendiente([listo, falta])?.id).toBe('b')
    expect(campoPendiente([listo])).toBeNull()
    expect(nadaUbicado([falta])).toBe(true)
    expect(nadaUbicado([listo, falta])).toBe(false)
  })
})

describe('primero el mapa: borde y potreros adentro', () => {
  const campo = (extra: Partial<CampoMapa>): CampoMapa => ({ id: 'c', nombre: 'El Bajo', provincia: 'Buenos Aires', lat: null, lon: null, hectareas: 100, contorno: cuadrado(1), potreros: [], ...extra })

  it('un dibujo que quedó lejos del campo cuenta como sin dibujar', () => {
    const lejos = potrero('1C', 50, { poligono: cuadrado(0.5, -35.4, -57.9) })
    const adentro = potrero('2C', 25, { poligono: cuadrado(0.5) })
    const e = estadoDe(campo({ potreros: [lejos, adentro] }))
    expect(e.tipo).toBe('faltan')
    expect(e.tipo === 'faltan' && e.faltan.map((p) => p.id)).toEqual(['1C'])
  })

  it('el borde sale de la unión de los potreros, y los contiene a todos', () => {
    // Dos cuadrados de 1 km pegados: un rectángulo de 2 × 1 km (≈ 200 ha).
    const a = cuadrado(1)
    const dLng = 1 / (111.32 * Math.cos((-35.5 * Math.PI) / 180))
    const b = cuadrado(1, -35.5, -58.0 + dLng)
    const borde = bordeDesdePotreros([potrero('1A', 100, { poligono: a }), potrero('2A', 100, { poligono: b })])!
    expect(hectareasDe(borde)).toBeGreaterThan(195)
    expect(hectareasDe(borde)).toBeLessThan(205)
    expect(fueraDelBorde(a, borde)).toBeLessThan(0.01)
    expect(fueraDelBorde(b, borde)).toBeLessThan(0.01)
    expect(estadoDe(campo({ contorno: borde, potreros: [potrero('1A', 100, { poligono: a }), potrero('2A', 100, { poligono: b })] })).tipo).toBe('listo')
  })

  it('si falta dibujar algún potrero no se inventa el borde', () => {
    expect(bordeDesdePotreros([potrero('1A', 100, { poligono: cuadrado(1) }), potrero('2A', 100)])).toBeNull()
    expect(bordeDesdePotreros([])).toBeNull()
  })
})

describe('lejos del alta: primero ajustar el dibujo', () => {
  it('el doble o más, o la mitad o menos', () => {
    expect(lejosDelAlta(1686, 300)).toBe(true)
    expect(lejosDelAlta(102, 9)).toBe(true)
    expect(lejosDelAlta(40, 100)).toBe(true)
    expect(lejosDelAlta(150, 100)).toBe(false)
    expect(lejosDelAlta(70, 100)).toBe(false)
    expect(lejosDelAlta(500, null)).toBe(false)
  })
})
