import { describe, expect, it } from 'vitest'
import { FICHAS } from '@/features/guia/fichas'
import { buscarFichas } from './buscar'

describe('buscar entre las dudas', () => {
  it('encuentra por palabras, sin tildes ni plurales', () => {
    expect(buscarFichas(FICHAS, 'dibujar potrero')[0]?.id).toBe('dibujar-potreros')
    expect(buscarFichas(FICHAS, 'cómo CARGO animales')[0]?.id).toBe('cargar-animales')
  })

  it('sin palabras que digan algo no muestra nada', () => {
    expect(buscarFichas(FICHAS, 'cómo hago')).toEqual([])
    expect(buscarFichas(FICHAS, 'zzzz')).toEqual([])
    // Lo que no está, no se disfraza con cualquier respuesta.
    expect(buscarFichas(FICHAS, 'cuánto cuesta la vacuna aftosa')).toEqual([])
    expect(buscarFichas(FICHAS, 'mover tropa')[0]?.id).toBe('mover-tropa')
  })
})
