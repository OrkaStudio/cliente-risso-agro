import { describe, expect, it } from 'vitest'
import { FICHAS } from '@/features/guia/fichas'
import type { CampoMapa, PotreroMapa } from '@/features/mapa/reglas'
import { responderLocal, sugerenciasDe } from './conversacion'

const potrero = (cabezas: number): PotreroMapa => ({ id: crypto.randomUUID(), nombre: '1A', hectareas: 10, poligono: null, cabezas, que: '' })
const campo = (nombre: string, cab: number): CampoMapa => ({ id: nombre, nombre, provincia: 'Buenos Aires', lat: null, lon: null, hectareas: 100, contorno: null, potreros: [potrero(cab)] })

describe('la conversación', () => {
  it('una duda de la app se contesta con su ficha y su botón', () => {
    const r = responderLocal('¿cómo dibujo los potreros?', FICHAS)
    expect(r.texto).toBe(FICHAS.find((f) => f.id === 'dibujar-potreros')!.respuesta)
    expect(r.accion?.ruta).toBe('/campos')
  })

  it('una pregunta de números no se disfraza con una ficha: lleva a WhatsApp', () => {
    for (const p of ['¿cuánta plata gané este mes?', 'cuántos animales tengo en La Loma', 'cuánto llovió']) {
      const r = responderLocal(p, FICHAS)
      expect(r.persona).toBe(true)
      expect(r.texto).toMatch(/WhatsApp/)
    }
  })

  it('lo que no sabe lo dice', () => {
    expect(responderLocal('qué raza de perro me recomendás', FICHAS)).toMatchObject({ persona: true, texto: /No tengo esa respuesta/ })
  })

  it('tres ejemplos: animales del campo con más hacienda, plata y una duda de la sección', () => {
    const s = sugerenciasDe([campo('La Loma', 0), campo('La Porteña', 17)], 'campos', FICHAS)
    expect(s.map((x) => x.texto)).toEqual(['¿Cuántos animales tengo en La Porteña?', '¿Cuánto gasté este mes?', FICHAS.find((f) => f.categoria === 'campos')!.chip])
    expect(s.map((x) => x.icono)).toEqual(['Vaca', 'Plata', 'Ayuda'])
  })
})
