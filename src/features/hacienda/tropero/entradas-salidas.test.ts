import { describe, expect, it } from 'vitest'
import { botonConfirmar, categoriasParaContar, composicionPorPotrero, cuantosTexto, pendientesDeIdentificar, tituloListo } from './entradas-salidas'

const a = (potrero_id: string, categoria: 'vaca' | 'ternero', caravana_rfid: string | null = null, estado = 'activo') => ({ potrero_id, categoria, caravana_rfid, estado })
const comp = composicionPorPotrero([a('p1', 'ternero'), a('p1', 'ternero', '032 1'), a('p1', 'vaca'), a('p1', 'vaca', null, 'vendido'), a('p2', 'vaca', '032 2')])

describe('entraron y salieron', () => {
  it('cuenta lo que hay en cada potrero, y cuántos sin caravana', () => {
    expect(comp.get('p1')?.get('ternero')).toEqual({ total: 2, sinCaravana: 1 })
    expect(comp.get('p1')?.get('vaca')).toEqual({ total: 1, sinCaravana: 1 })
  })
  it('en una salida se cuenta lo que hay; corregir sólo los sin caravana', () => {
    expect(categoriasParaContar({ modo: 'salieron', que: 'venta' }, comp.get('p1'))).toEqual([
      { categoria: 'ternero', hay: 2, max: 2 },
      { categoria: 'vaca', hay: 1, max: 1 },
    ])
    expect(categoriasParaContar({ modo: 'salieron', que: 'correccion' }, comp.get('p1'))[0]).toEqual({ categoria: 'ternero', hay: 2, max: 1 })
    expect(categoriasParaContar({ modo: 'entraron', que: 'nacimiento' }, undefined).map((c) => c.categoria)).toEqual(['ternero', 'ternera'])
  })
  it('primero salen los sin caravana; el resto queda para identificar', () => {
    expect(pendientesDeIdentificar([{ categoria: 'ternero', cantidad: 2 }], comp.get('p1'))).toBe(1)
    expect(pendientesDeIdentificar([{ categoria: 'vaca', cantidad: 1 }], comp.get('p1'))).toBe(0)
  })
  it('lo dice con verbo y cuántos', () => {
    const items = [{ categoria: 'ternero' as const, cantidad: 12 }, { categoria: 'vaca' as const, cantidad: 2 }]
    expect(cuantosTexto(items)).toBe('12 terneros y 2 vacas')
    expect(botonConfirmar({ modo: 'salieron', que: 'venta' }, items)).toBe('Vender 12 terneros y 2 vacas')
    expect(botonConfirmar({ modo: 'salieron', que: 'otroCampo' }, items, '3B')).toBe('Llevar 12 terneros y 2 vacas al 3B')
    expect(tituloListo({ modo: 'salieron', que: 'venta' }, [{ categoria: 'ternero', cantidad: 1 }])).toBe('Se vendió 1 ternero')
  })
})
