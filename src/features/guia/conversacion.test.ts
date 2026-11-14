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
    expect(s.map((x) => x.texto)).toEqual(['¿Cuántos animales hay en La Porteña?', '¿Cuánto gasté este mes?', FICHAS.find((f) => f.categoria === 'campos')!.chip])
    expect(s.map((x) => x.icono)).toEqual(['Vaca', 'Plata', 'Ayuda'])
  })
  it('a quien no ve la plata ni la hacienda no le sugiere esas preguntas (permisos, 13/11)', () => {
    const s = sugerenciasDe([campo('La Porteña', 17)], 'campos', FICHAS, { plata: false, hacienda: false, campos: true })
    expect(s.map((x) => x.icono)).toEqual(['Ayuda'])
  })
  it('lo que no tiene habilitado se dice; no lo manda a WhatsApp (permisos, 13/11)', () => {
    const r = responderLocal('¿Cuánto gasté este mes?', FICHAS, { plata: false, hacienda: true, campos: true })
    expect(r.texto).toContain('la plata la maneja el dueño del campo')
    expect(r.persona).toBeUndefined()
    expect(responderLocal('¿cuántas cabezas hay?', FICHAS, { plata: true, hacienda: false, campos: true }).texto).toContain('la hacienda la maneja')
    expect(responderLocal('¿cuánto llovió?', FICHAS, { plata: true, hacienda: true, campos: false }).texto).toContain('los campos los maneja')
  })
})
