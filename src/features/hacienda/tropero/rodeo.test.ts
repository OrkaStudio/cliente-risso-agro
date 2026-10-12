import { describe, expect, it } from 'vitest'
import { resumirEventos } from '../senales'
import { bajadaDelRodeo, edadTexto, filasDelRodeo, resumirRodeo, type AnimalRodeo } from './rodeo'

const hoy = new Date('2026-10-12T12:00:00')
const HOY = '2026-10-12'
const animal = (id: string, extra: Partial<AnimalRodeo> = {}): AnimalRodeo => ({
  id, categoria: 'vaca', fecha_nacimiento: '2021-05-01', potrero_id: 'p1', caravana_visual: id, caravana_rfid: `032 ${id}`, ...extra,
})
const potreros = [{ id: 'p1', nombre: '11B', campo_id: 'c1' }, { id: 'p2', nombre: '2D', campo_id: 'c2' }]
const campos = [{ id: 'c1', nombre: 'La Porteña' }, { id: 'c2', nombre: 'Los Pampas' }]

describe('el rodeo', () => {
  const eventos = resumirEventos([
    { animal_id: '1040', tipo: 'tacto', fecha: '2026-03-10', datos: { resultado: 'prenada' } },
    { animal_id: '1033', tipo: 'tacto', fecha: HOY, datos: { resultado: 'vacia' } },
    { animal_id: '0877', tipo: 'pesaje', fecha: '2026-10-01', datos: { kg: 412 } },
    { animal_id: '1161', tipo: 'pesaje', fecha: '2026-10-01', datos: { kg: 186 } },
  ])
  const filas = filasDelRodeo(
    [
      animal('1040'),
      animal('1033'),
      animal('0877', { categoria: 'novillo', fecha_nacimiento: '2025-02-01', potrero_id: 'p2' }),
      animal('1161', { categoria: 'ternero', fecha_nacimiento: '2026-03-01' }),
      animal('1172', { caravana_rfid: null }),
      animal('x', { caravana_visual: null, caravana_rfid: null, fecha_nacimiento: null }),
      animal('y1', { categoria: 'oveja' }),
    ],
    potreros, campos, eventos, HOY, hoy,
  )

  it('ordena por lo que hay que hacer', () => {
    expect(filas.map((f) => [f.id, f.estado])).toEqual([
      ['1161', 'destetar'], ['0877', 'vender'], ['1033', 'vacia'], ['x', 'sinCaravana'], ['1172', 'sinElectronica'], ['1040', 'prenada'], ['y1', 'nada'],
    ])
  })
  it('dice qué es, dónde está y lo último que se sabe', () => {
    const f = Object.fromEntries(filas.map((x) => [x.id, x]))
    expect(f['1161']).toMatchObject({ queEs: 'Ternero, 7 meses', donde: '11B, La Porteña', ultimoDato: '186 kg' })
    expect(f['0877']).toMatchObject({ queEs: 'Novillo, 20 meses', donde: '2D, Los Pampas', ultimoDato: '412 kg' })
    expect(f['1040']!.ultimoDato).toBe('Preñada en marzo')
    expect(f['1033']!.ultimoDato).toBe('Vacía hoy')
    expect(f['x']).toMatchObject({ queEs: 'Vaca', ultimoDato: null })
  })
  it('resume por especie, campo y estado, y lo dice en una frase', () => {
    const r = resumirRodeo(filas, campos)
    expect(r.porEspecie).toEqual({ bovino: 6, ovino: 1, equino: 0 })
    expect(r.porCampo).toEqual([{ id: 'c1', nombre: 'La Porteña', cabezas: 6 }, { id: 'c2', nombre: 'Los Pampas', cabezas: 1 }])
    expect(r.porEstado.destetar).toBe(1)
    const vacunos = resumirRodeo(filas.filter((f) => f.especie === 'bovino'), campos)
    expect(bajadaDelRodeo(vacunos, r, 'bovino', false)).toBe('5 en La Porteña y 1 en Los Pampas. Más 1 ovino.')
    expect(bajadaDelRodeo(vacunos, r, 'bovino', true)).toBe('Más 1 ovino.')
  })
  it('la edad en meses hasta los dos años, después en años', () => {
    expect(edadTexto('2026-09-01', hoy)).toBe('1 mes')
    expect(edadTexto('2023-01-01', hoy)).toBe('3 años')
    expect(edadTexto(null, hoy)).toBeNull()
  })
})
