import { describe, expect, it } from 'vitest'
import { resumirEventos } from '../senales'
import { avisoDelAnimal, desdeCuando, fraseDelAnimal, historiaDelAnimal, loQueHayQueSaber, rasgosDelAnimal, type EventoFicha } from './ficha'

const hoy = new Date('2026-10-12T12:00:00')
const ev = (tipo: EventoFicha['tipo'], fecha: string, datos: object = {}, nota: string | null = null): EventoFicha => ({ id: `${tipo}-${fecha}`, tipo, fecha, datos, nota })

describe('la ficha del animal', () => {
  it('lo describe en una frase', () => {
    expect(fraseDelAnimal({ fecha_nacimiento: '2026-03-01', raza: 'Angus', pelaje: 'Negro' }, { potrero: '11B', campo: 'La Porteña' }, hoy)).toBe('7 meses. Angus negro. Hoy en el 11B de La Porteña.')
    expect(fraseDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, null, hoy)).toBe('Todavía no está en un potrero.')
    expect(fraseDelAnimal({ fecha_nacimiento: '2021-04-05', raza: null, pelaje: null }, { potrero: '1A', campo: 'La Porteña' }, hoy, { fecha: '2026-10-12', murio: false })).toBe('5 años. Salió del 1A de La Porteña el 12/10.')
    expect(fraseDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, { potrero: '1A', campo: null }, hoy, { fecha: '2026-10-12', murio: true })).toBe('Murió en el 1A el 12/10.')
    expect(fraseDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, { potrero: '1A', campo: null }, hoy, { fecha: '2026-10-12', murio: false, corregido: true })).toBe('Se sacó del 1A el 12/10: estaba cargado de más.')
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
      { nombre: 'Último peso', valor: '186 kg, 01/10' },
      { nombre: 'Última sanidad', valor: 'Aftosa y carbunclo, 21/08' },
      { nombre: 'Destete', valor: 'Previsto para noviembre, a los 8 meses' },
    ])
  })
  it('su historia, de lo nuevo a lo viejo, con el detalle de cada cosa', () => {
    expect(historiaDelAnimal(eventos).map((h) => [h.dia, h.titulo, h.detalle])).toEqual([
      ['1 oct', 'Pesada', '186 kg'],
      ['21 ago', 'Sanidad', 'Aftosa y carbunclo'],
      ['12 mar', 'Pasó al 11B', 'Venía del 4B'],
      ['5 mar', 'Alta', 'Con la caravana 1161'],
    ])
  })
  it('arriba, sólo los rasgos que se saben, y desde cuándo está en su potrero', () => {
    expect(rasgosDelAnimal({ fecha_nacimiento: '2026-03-01', raza: 'Angus', pelaje: 'Negro' }, hoy)).toEqual([
      { nombre: 'Edad', valor: '7 meses' },
      { nombre: 'Raza', valor: 'Angus negro' },
    ])
    expect(rasgosDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, hoy)).toEqual([])
    expect(desdeCuando(eventos, '11B')).toBe('Desde el 12 de marzo. Venía del 4B.')
    expect(desdeCuando([ev('alta', '2026-03-05')], '1A')).toBe('Desde el 5 de marzo.')
  })
  it('lo corregido queda en la historia con el antes', () => {
    const h = historiaDelAnimal([
      { id: 'c', tipo: 'nota', fecha: '2026-10-19', nota: 'Se corrigieron datos', datos: { correccion: { categoria: { antes: 'vaquillona', despues: 'vaca' }, raza: { antes: null, despues: 'Angus' } } } },
      ev('cambio_caravana', '2026-10-18', { nuevo: '1040', visual: '1040', antes: { visual: '1032' } }),
    ])
    expect(h.map((x) => [x.titulo, x.detalle])).toEqual([
      ['Se corrigieron datos', 'Qué es: Vaquillona → Vaca · Raza: sin dato → Angus'],
      ['Caravana nueva: la 1040', 'Antes tenía la 1032'],
    ])
  })
  it('el aviso dice lo que importa del estado', () => {
    const rr = resumirEventos([{ animal_id: 'v', tipo: 'tacto', fecha: '2026-03-12', datos: { resultado: 'prenada', meses: 3 } }]).get('v')
    expect(avisoDelAnimal('prenada', rr)).toEqual({ texto: 'Preñada · pare en septiembre', tono: 'bien' })
    expect(avisoDelAnimal('nada', undefined)).toBeNull()
  })
})

describe('la historia con una salida corregida', () => {
  it('la baja que después se deshizo se muestra como anotación corregida', () => {
    const h = historiaDelAnimal([
      ev('baja', '2026-10-12', { estado: 'vendido', salida_id: 's1' }),
      { id: 'n1', tipo: 'nota', fecha: '2026-10-14', datos: { resuelve: 'baja-2026-10-12', vuelve_al_rodeo: true }, nota: 'Vuelve al rodeo: la salida queda sin identificar' },
    ])
    expect(h.map((x) => [x.titulo, x.detalle])).toEqual([
      ['Volvió al rodeo', 'Vuelve al rodeo: la salida queda sin identificar'],
      ['Se anotó como vendida', 'Después se corrigió: no era ésta'],
    ])
  })
  it('una anulada también', () => {
    const h = historiaDelAnimal([
      ev('baja', '2026-10-12', { estado: 'vendido', salida_id: 's9' }),
      { id: 'n2', tipo: 'nota', fecha: '2026-10-13', datos: { anula_salida: 's9', vuelve_al_rodeo: true }, nota: 'Se anuló la salida: vuelve al rodeo' },
    ])
    expect(h[1]!.titulo).toBe('Se anotó como vendida')
  })
})
