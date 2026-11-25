import { describe, expect, it } from 'vitest'

import { TANDA, todasLasFilas } from './todas-las-filas'

/** Una «base» de n filas que contesta como Supabase: como mucho TANDA por pedido. */
function base(n: number) {
  const filas = Array.from({ length: n }, (_, i) => ({ id: i }))
  const pedidos: [number, number][] = []
  const pedir = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta])
    return { data: filas.slice(desde, Math.min(hasta + 1, desde + TANDA)), error: null }
  }
  return { pedir, pedidos }
}

describe('todasLasFilas', () => {
  it('trae más de 1000 filas juntando tandas, sin repetir ni saltear', async () => {
    const b = base(2345)
    const todas = await todasLasFilas(b.pedir)
    expect(todas).toHaveLength(2345)
    expect(new Set(todas.map((x) => x.id)).size).toBe(2345)
    expect(b.pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('con menos de una tanda pide una sola vez', async () => {
    const b = base(12)
    expect(await todasLasFilas(b.pedir)).toHaveLength(12)
    expect(b.pedidos).toHaveLength(1)
  })

  it('justo 1000: pide otra tanda, que vuelve vacía, y termina', async () => {
    const b = base(1000)
    expect(await todasLasFilas(b.pedir)).toHaveLength(1000)
    expect(b.pedidos).toHaveLength(2)
  })

  it('si la base falla, tira el error con su código', async () => {
    const pedir = async () => ({ data: null, error: { message: 'Ya hay un potrero 4', code: 'P0001' } })
    await expect(todasLasFilas(pedir)).rejects.toMatchObject({ message: 'Ya hay un potrero 4', code: 'P0001' })
  })
})
