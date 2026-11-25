import { describe, expect, it, vi } from 'vitest'
import { confirmarConVerificacion } from './confirmacion.ts'

function caso() {
  return {
    escribir: vi.fn(async () => undefined),
    resumir: vi.fn(async () => 'Listo, van 87 mm.'),
    verificar: vi.fn(async () => true),
    mensajeGuardada: 'La lluvia quedó cargada.',
  }
}

describe('confirmación con verificación de la carga', () => {
  it('responde con el resumen después de guardar, sin una consulta adicional', async () => {
    const d = caso()
    expect(await confirmarConVerificacion(d)).toEqual({ estado: 'guardada', texto: 'Listo, van 87 mm.' })
    expect(d.escribir).toHaveBeenCalledOnce()
    expect(d.verificar).not.toHaveBeenCalled()
  })

  it('si falla el resumen después de guardar, comprueba la carga y confirma sin repetirla', async () => {
    const d = caso()
    d.resumir.mockRejectedValue(new Error('falló el acumulado'))
    expect(await confirmarConVerificacion(d)).toEqual({
      estado: 'guardada', texto: 'La lluvia quedó cargada.', error: 'falló el acumulado',
    })
    expect(d.verificar).toHaveBeenCalledOnce()
    expect(d.escribir).toHaveBeenCalledOnce()
  })

  it('resuelve una respuesta perdida de la escritura consultando el ID guardado', async () => {
    const d = caso()
    d.escribir.mockRejectedValue(new Error('conexión cerrada al confirmar'))
    expect(await confirmarConVerificacion(d)).toMatchObject({ estado: 'guardada', texto: 'La lluvia quedó cargada.' })
    expect(d.resumir).not.toHaveBeenCalled()
    expect(d.escribir).toHaveBeenCalledOnce()
    expect(d.verificar).toHaveBeenCalledOnce()
  })

  it('permite reintentar sólo cuando la comprobación no encuentra la carga', async () => {
    const d = caso()
    d.escribir.mockRejectedValue(new Error('escritura rechazada'))
    d.verificar.mockResolvedValue(false)
    const r = await confirmarConVerificacion(d)
    expect(r.estado).toBe('no_guardada')
    expect(r.texto).toContain('Comprobé que no está en la base')
    expect(d.escribir).toHaveBeenCalledOnce()
  })

  it('si falla también la consulta, no afirma éxito ni invita a duplicar', async () => {
    const d = caso()
    d.escribir.mockRejectedValue(new Error('sin conexión'))
    d.verificar.mockRejectedValue(new Error('base no disponible'))
    const r = await confirmarConVerificacion(d)
    expect(r.estado).toBe('sin_verificar')
    expect(r.texto).toContain('No vuelvas a enviarla todavía')
    expect(d.escribir).toHaveBeenCalledOnce()
  })

  it('mantiene un error de resumen como guardado desconocido cuando no puede verificar', async () => {
    const d = caso()
    d.resumir.mockRejectedValue(new Error('falló la lectura'))
    d.verificar.mockRejectedValue(new Error('base no disponible'))
    expect(await confirmarConVerificacion(d)).toMatchObject({ estado: 'sin_verificar', error: 'falló la lectura' })
    expect(d.escribir).toHaveBeenCalledOnce()
  })
})
