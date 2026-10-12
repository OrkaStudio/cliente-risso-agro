import { describe, expect, it } from 'vitest'
import { resumirEventos } from '../senales'
import { avisoDelAnimal, fraseDelAnimal, historiaDelAnimal, loQueHayQueSaber, type EventoFicha } from './ficha'

const hoy = new Date('2026-10-12T12:00:00')
const ev = (tipo: EventoFicha['tipo'], fecha: string, datos: object = {}, nota: string | null = null): EventoFicha => ({ id: `${tipo}-${fecha}`, tipo, fecha, datos, nota })

describe('la ficha del animal', () => {
  it('lo describe en una frase', () => {
    expect(fraseDelAnimal({ fecha_nacimiento: '2026-03-01', raza: 'Angus', pelaje: 'Negro' }, { potrero: '11B', campo: 'La Porteña' }, hoy)).toBe('7 meses. Angus negro. Hoy en el 11B de La Porteña.')
    expect(fraseDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, null, hoy)).toBe('Todavía no está en un potrero.')
  })
  const eventos = [
    ev('alta', '2026-03-05', { caravana: '1161' }),
    ev('movimiento', '2026-03-12', { potrero_origen: '4B', potrero_destino: '11B' }),
    ev('sanidad', '2026-08-21', { tratamiento: 'Aftosa y carbunclo' }),
    ev('pesaje', '2026-10-01', { kg: 186 }),
  ]
  const r = resumirEventos(eventos.map((e) => ({ animal_id: 'a', tipo: e.tipo, fecha: e.fecha, datos: e.datos }))).get('a')
  it('lo que hay que saber, sólo con dato', () => {
    expect(loQueHayQueSaber({ categoria: 'ternero', fecha_nacimiento: '2026-03-01', origen: 'nacimiento' }, r, eventos, null, hoy)).toEqual([
      { nombre: 'Nació', valor: '1 de marzo de 2026 · 7 meses' },
      { nombre: 'Último peso', valor: '186 kg, 01/10' },
      { nombre: 'Última sanidad', valor: 'Aftosa y carbunclo, 21/08' },
      { nombre: 'Último movimiento', valor: 'Del 4B al 11B, 12/03' },
      { nombre: 'Destete', valor: 'Previsto para noviembre, a los 8 meses' },
    ])
  })
  it('su historia, de lo nuevo a lo viejo, con el detalle de cada cosa', () => {
    expect(historiaDelAnimal(eventos).map((h) => [h.dia, h.titulo, h.detalle])).toEqual([
      ['1 oct', 'Pesada', '186 kg'],
      ['21 ago', 'Sanidad', 'Aftosa y carbunclo'],
      ['12 mar', 'Movimiento', 'Del 4B al 11B'],
      ['5 mar', 'Alta', 'Con la caravana 1161'],
    ])
  })
  it('el aviso dice lo que importa del estado', () => {
    const rr = resumirEventos([{ animal_id: 'v', tipo: 'tacto', fecha: '2026-03-12', datos: { resultado: 'prenada', meses: 3 } }]).get('v')
    expect(avisoDelAnimal('prenada', rr)).toEqual({ texto: 'Preñada · pare en septiembre', tono: 'bien' })
    expect(avisoDelAnimal('nada', undefined)).toBeNull()
  })
})
