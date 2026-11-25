import { describe, expect, it } from 'vitest'
import { comoSePaga, leer, siguientePaso } from './conversacion'
import type { Borrador, Contexto } from './tipos'

// Un gasto de un invitado: quién lo pagó y, si hay que pagarlo, para cuándo (permisos, 14/11).
const campos = [{ id: 'c1', nombre: 'La Porteña', potreros: [] }]
const cats = [{ id: 'k1', nombre: 'Combustible' }]
const dueno: Contexto = { hoy: '2026-11-14', nombre: 'Daniel', campos, categoriasGasto: cats }
const juan: Contexto = { ...dueno, nombre: 'Juan', niveles: { hacienda: 'no', campos: 'no', plata: 'solo_manda' } }
const gasto: Borrador = { tipo: 'gasto', campoId: 'c1', monto: 85000, categoriaId: 'k1' }

describe('quién pagó un gasto de un invitado', () => {
  it('al dueño no se le pregunta: lo paga el campo, como siempre', () => {
    expect(siguientePaso('cap', gasto, dueno).k).toBe('proponer')
  })
  it('al invitado se le pregunta, con tres botones', () => {
    const p = siguientePaso('cap', gasto, juan)
    expect(p.k).toBe('preguntar')
    if (p.k !== 'preguntar') return
    expect(p.pendiente.tipo).toBe('pago')
    expect(p.mensaje.botones?.map((b) => b.titulo)).toEqual(['Ya está pagado', 'Lo pagué yo', 'Hay que pagarlo'])
  })
  it('«Lo pagué yo» propone el reintegro', () => {
    const l = leer({ botonId: 'cap|pg=yo' }, { tipo: 'pago', capturaId: 'cap', borrador: gasto }, juan)
    expect(l.k).toBe('seguir')
    if (l.k !== 'seguir') return
    const p = siguientePaso('cap', l.borrador, juan)
    expect(p.k).toBe('proponer')
    if (p.k === 'proponer') expect(p.mensaje.texto).toContain('queda para devolvértelo')
  })
  it('«Hay que pagarlo» pregunta para cuándo; con la respuesta, propone con el vencimiento', () => {
    const b = { ...gasto, pago: 'a_pagar' as const }
    const p = siguientePaso('cap', b, juan)
    expect(p.k === 'preguntar' && p.pendiente.tipo).toBe('vence')
    const l = leer({ texto: 'en 10 días' }, { tipo: 'vence', capturaId: 'cap', borrador: b }, juan)
    expect(l.k === 'seguir' && l.borrador.venceDias).toBe(10)
    expect(comoSePaga({ ...b, venceDias: 10 }, juan)).toBe('a pagar el 24/11')
  })
  it('se entiende escrito: «lo puse yo», «hay que pagarlo», «ya está pagado»', () => {
    const p = { tipo: 'pago' as const, capturaId: 'cap', borrador: gasto }
    const pago = (texto: string) => { const l = leer({ texto }, p, juan); return l.k === 'seguir' ? l.borrador.pago : null }
    expect(pago('lo puse yo')).toBe('yo')
    expect(pago('hay que pagarlo')).toBe('a_pagar')
    expect(pago('ya está pagado')).toBe('campo')
  })
})

describe('una foto que no se lee', () => {
  it('al invitado se le pregunta el monto, sin adivinar, y la foto sigue con el gasto', () => {
    const p = siguientePaso('cap', { tipo: 'gasto', campoId: 'c1', monto: null, fotoMediaId: 'm1' }, juan)
    expect(p.k).toBe('preguntar')
    if (p.k === 'preguntar') {
      expect(p.mensaje.texto).toContain('No pude leer el monto en la foto')
      expect(p.pendiente.tipo).toBe('dato')
    }
  })
})
