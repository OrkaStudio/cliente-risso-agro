import { describe, expect, it } from 'vitest'
import { botonId, leer, siguientePaso } from './conversacion.ts'
import type { Contexto, Pendiente } from './tipos.ts'

const ctx: Contexto = {
  hoy: '2026-10-12', nombre: 'Fran', categoriasGasto: [{ id: 'comb', nombre: 'Combustible' }],
  campos: [
    { id: 'pampas', nombre: 'Los Pampas', potreros: [] },
    { id: 'toimil', nombre: 'Toimil', potreros: [] },
  ],
}

function pedirCampo(mm: number | null = 10, fecha?: string) {
  const paso = siguientePaso('captura', { tipo: 'lluvia', mm, fecha }, ctx)
  if (paso.k !== 'preguntar' || paso.pendiente.tipo !== 'campo') throw new Error('Debe pedir el campo')
  return paso
}

describe('elegir campo como confirmación explícita de lluvia', () => {
  it('informa cantidad y fecha, y aclara que elegir guarda la lluvia', () => {
    const paso = pedirCampo()
    expect(paso.mensaje.texto).toContain('10 mm')
    expect(paso.mensaje.texto).toContain('hoy')
    expect(paso.mensaje.texto).toContain('queda guardado')
    expect(paso.pendiente).toMatchObject({ confirmaAlElegir: true, borrador: { fecha: '2026-10-12' } })
  })

  it('el botón nuevo completa el campo y confirma una sola vez', () => {
    const paso = pedirCampo()
    const id = paso.mensaje.botones![0].id
    expect(leer({ botonId: id }, paso.pendiente, ctx)).toEqual({
      k: 'confirmar', capturaId: 'captura',
      borrador: { tipo: 'lluvia', mm: 10, fecha: '2026-10-12', campoId: 'pampas', campoMencion: null },
    })
    expect(leer({ botonId: id }, null, ctx).k).toBe('viejo')
  })

  it('escribir el nombre también confirma después del aviso explícito', () => {
    const paso = pedirCampo()
    expect(leer({ texto: 'Los Pampas' }, paso.pendiente, ctx)).toMatchObject({ k: 'confirmar', borrador: { campoId: 'pampas' } })
  })

  it('una pregunta anterior al despliegue sigue pidiendo confirmación', () => {
    const viejo: Pendiente = { tipo: 'campo', capturaId: 'captura', borrador: { tipo: 'lluvia', mm: 10 } }
    expect(leer({ texto: 'Los Pampas' }, viejo, ctx).k).toBe('seguir')
    expect(leer({ botonId: botonId('captura', 'c=pampas') }, viejo, ctx).k).toBe('seguir')
  })

  it('un botón anterior con otros milímetros no confirma la pregunta nueva', () => {
    const viejo = pedirCampo(10)
    const nuevo = pedirCampo(19)
    expect(leer({ botonId: viejo.mensaje.botones![0].id }, nuevo.pendiente, ctx).k).toBe('viejo')
  })

  it('un botón anterior con otra fecha no confirma la pregunta nueva', () => {
    const viejo = pedirCampo(10, '2026-10-11')
    const nuevo = pedirCampo(10, '2026-10-12')
    expect(leer({ botonId: viejo.mensaje.botones![0].id }, nuevo.pendiente, ctx).k).toBe('viejo')
  })

  it('no confirma un campo ajeno a la lista ofrecida', () => {
    const paso = pedirCampo()
    const id = paso.mensaje.botones![0].id.replace('pampas', 'otro-campo')
    expect(leer({ botonId: id }, paso.pendiente, ctx).k).toBe('viejo')
  })

  it('un botón de otra captura nunca confirma', () => {
    const paso = pedirCampo()
    const id = paso.mensaje.botones![0].id.replace('captura|', 'otra|')
    expect(leer({ botonId: id }, paso.pendiente, ctx).k).toBe('viejo')
  })

  it('una lista de candidatos no permite confirmar otro campo válido de la empresa', () => {
    const ambiguos = { ...ctx, campos: [
      { id: 'n1', nombre: 'Norte', potreros: [] }, { id: 'n2', nombre: 'Norte', potreros: [] },
      { id: 'sur', nombre: 'Sur', potreros: [] },
    ] }
    const paso = siguientePaso('captura', { tipo: 'lluvia', mm: 10, campoMencion: 'Norte' }, ambiguos)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    const id = paso.mensaje.botones![0].id.replace('n1', 'sur')
    expect(leer({ botonId: id }, paso.pendiente, ambiguos).k).toBe('viejo')
    expect(leer({ texto: 'Sur' }, paso.pendiente, ambiguos).k).toBe('seguir')
  })

  it('un botón c= de una pregunta vieja no se convierte en guardado directo', () => {
    const paso = pedirCampo()
    expect(leer({ botonId: botonId('captura', 'c=pampas') }, paso.pendiente, ctx).k).toBe('seguir')
  })

  it('conserva la fecha que mostró aunque el usuario elija después de medianoche', () => {
    const paso = pedirCampo()
    expect(leer({ texto: 'Los Pampas' }, paso.pendiente, { ...ctx, hoy: '2026-10-13' })).toMatchObject({
      k: 'confirmar', borrador: { fecha: '2026-10-12' },
    })
  })

  it('permite cancelar en lugar de elegir un campo', () => {
    const paso = pedirCampo()
    expect(leer({ texto: 'cancelar' }, paso.pendiente, ctx)).toEqual({ k: 'cancelar', capturaId: 'captura' })
  })

  it('no ofrece guardado directo si faltan milímetros o la fecha es futura o inválida', () => {
    const sinMm = pedirCampo(null)
    expect(sinMm.pendiente).not.toMatchObject({ confirmaAlElegir: true })
    expect(leer({ texto: 'Los Pampas' }, sinMm.pendiente, ctx).k).toBe('seguir')
    for (const fecha of ['2026-10-13', '2026-02-31']) {
      const paso = siguientePaso('captura', { tipo: 'lluvia', mm: 10, fecha }, ctx)
      expect(paso.k).toBe('preguntar')
      expect('pendiente' in paso && paso.pendiente.tipo).toBe('corregir')
      expect('mensaje' in paso && paso.mensaje.texto).toContain('fecha')
    }
  })

  it('cero milímetros es una medición válida', () => {
    const paso = pedirCampo(0)
    expect(leer({ texto: 'Los Pampas' }, paso.pendiente, ctx)).toMatchObject({ k: 'confirmar', borrador: { mm: 0 } })
  })

  it('más de diez campos permite confirmar escribiendo el nombre', () => {
    const muchos = { ...ctx, campos: Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, nombre: `Campo ${i}`, potreros: [] })) }
    const paso = siguientePaso('captura', { tipo: 'lluvia', mm: 10 }, muchos)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    expect(paso.mensaje.texto).toContain('Escribime el nombre')
    expect(leer({ texto: 'Campo 5' }, paso.pendiente, muchos)).toMatchObject({ k: 'confirmar', borrador: { campoId: 'c5' } })
  })

  it('los gastos siguen con su propuesta financiera', () => {
    const paso = siguientePaso('captura', { tipo: 'gasto', monto: 1234, categoriaId: 'comb' }, ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    expect(leer({ texto: 'Los Pampas' }, paso.pendiente, ctx).k).toBe('seguir')
  })
})
