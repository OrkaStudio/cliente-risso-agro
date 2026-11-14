import { describe, expect, it } from 'vitest'
import type { Resumen } from '@/features/guia/estado'
import type { CampoMapa, PotreroMapa } from '@/features/mapa/reglas'
import { avisosDe, progresoDe } from './avisos'

const resumen = (r: Partial<Resumen> = {}): Resumen => ({
  campos: 2,
  sinContorno: [],
  potreros: 2,
  potrerosDibujados: 2,
  cabezas: 30,
  sinPotrero: 0,
  alquilados: 0,
  alquilerPendiente: [],
  recorridas: 1,
  ...r,
})
const potrero = (cabezas: number, tipo: PotreroMapa['tipo'] = cabezas > 0 ? 'hacienda' : 'vacio'): PotreroMapa => ({
  id: crypto.randomUUID(),
  nombre: '1A',
  hectareas: 10,
  poligono: null,
  cabezas,
  que: '',
  tipo,
})
const campo = (nombre: string, potreros: PotreroMapa[]): CampoMapa => ({
  id: nombre,
  nombre,
  provincia: 'Buenos Aires',
  lat: null,
  lon: null,
  hectareas: 100,
  contorno: null,
  potreros,
})

describe('lo que notó el asistente', () => {
  it('sin el mapa, sólo pide el mapa, por el campo que falta', () => {
    const a = avisosDe(resumen({ sinContorno: [{ id: 'c1', nombre: 'La Porteña', provincia: 'Buenos Aires' }], recorridas: 0 }), [], true)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ titulo: 'Falta ubicar La Porteña en el mapa', accion: { ruta: '/campos' } })
  })

  it('nombra los campos sin hacienda, pero no los de agricultura', () => {
    const campos = [campo('La Porteña', [potrero(17)]), campo('La Loma', [potrero(0)]), campo('Campo Prueba', [potrero(0)]), campo('El Trigal', [potrero(0, 'sembrado')])]
    const a = avisosDe(resumen(), campos, false)
    expect(a.map((x) => x.titulo)).toEqual(['La Loma y Campo Prueba no tienen hacienda cargada'])
    expect(a[0]!.accion).toMatchObject({ ruta: '/hacienda', ancla: 'hacienda-entraron' })
  })

  it('con muchos campos sin hacienda nombra dos y cuenta el resto', () => {
    const campos = ['A', 'B', 'C', 'D', 'E'].map((n) => campo(n, [potrero(0)]))
    expect(avisosDe(resumen(), campos, false)[0]!.titulo).toBe('A, B y 3 campos más no tienen hacienda cargada')
  })

  it('un alquiler pendiente por campo y la recorrida, que es del celular', () => {
    const a = avisosDe(resumen({ alquilados: 1, alquilerPendiente: [{ id: 'c3', nombre: 'El Bajo' }], recorridas: 0 }), [], false)
    expect(a.map((x) => x.titulo)).toEqual(['Falta el alquiler de El Bajo', 'Todavía no recorriste ningún campo'])
    expect(a[1]!.accion).toBeNull()
  })

  it('con todo hecho no dice nada', () => {
    expect(avisosDe(resumen(), [campo('La Porteña', [potrero(30)])], false)).toEqual([])
  })
})

describe('el progreso', () => {
  it('el alquiler cuenta sólo si hay campos alquilados', () => {
    expect(progresoDe(resumen(), [], false).map((p) => p.id)).not.toContain('alquiler')
    expect(progresoDe(resumen({ alquilados: 1 }), [], false).map((p) => p.id)).toContain('alquiler')
  })

  it('sin el mapa, ni el mapa ni la hacienda están hechos', () => {
    const p = progresoDe(resumen({ recorridas: 0 }), [campo('La Porteña', [potrero(30)])], true)
    expect(p.filter((x) => x.hecho).map((x) => x.id)).toEqual(['potreros'])
  })
})
