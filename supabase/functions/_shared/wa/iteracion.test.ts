import { describe, expect, it } from 'vitest'
import { arrancar, corregir, leer, siguientePaso } from './conversacion.ts'
import { limpiarInterpretacion, promptInterpretar } from './interpretar.ts'
import { potreroEnPunto } from './resolver.ts'
import { payload, prepararMensajes } from '../../wa-webhook/meta.ts'
import { resumenGastos, resumenRecorrida, ultimaObservacion, novedades, cargasRecientes } from './respuestas.ts'
import type { Contexto, Pendiente } from './tipos.ts'
import { inicioSemana, numeroEn, pesos } from './texto.ts'

const ctx: Contexto = {
  hoy: '2026-10-12', nombre: 'Fran',
  campos: [{ id: 'c', nombre: 'La Porteña', potreros: [{ id: 'p', nombre: '3B' }] }],
  categoriasGasto: [{ id: 'gas', nombre: 'Combustible' }],
}
const interpretacion = (raw: unknown) => limpiarInterpretacion(raw)

describe('nuevas consultas', () => {
  for (const intent of ['consulta_recorrida', 'consulta_observacion', 'consulta_novedades', 'consulta_gastos', 'consulta_cargas']) {
    it(`entiende ${intent} y sólo consulta`, () => {
      const a = arrancar(interpretacion({ intent, campo: 'La Porteña', potrero: intent === 'consulta_observacion' ? '3B' : null }), ctx)
      expect('borrador' in a).toBe(true)
      if (!('borrador' in a)) return
      expect(a.borrador.tipo).toBe(intent)
      expect(siguientePaso('cap', a.borrador, ctx).k).toBe('consultar')
      expect(promptInterpretar('qué me falta recorrer', ctx)).toContain(`"${intent}"`)
    })
  }
  it('no responde por todos los campos cuando se pidió uno inexistente', () => {
    const a = arrancar(interpretacion({ intent: 'consulta_recorrida', campo: 'Las Toscas' }), ctx)
    expect('borrador' in a).toBe(true)
    if (!('borrador' in a)) return
    const paso = siguientePaso('cap', a.borrador, ctx)
    expect(paso.k).toBe('decir')
    expect('mensaje' in paso && paso.mensaje.texto).toContain('Las Toscas')
  })
  it('pide el potrero para consultar su última observación', () => {
    const a = arrancar(interpretacion({ intent: 'consulta_observacion', campo: 'La Porteña' }), ctx)
    if (!('borrador' in a)) throw new Error('Falta borrador')
    const paso = siguientePaso('cap', a.borrador, ctx)
    expect(paso.k).toBe('preguntar')
    expect('pendiente' in paso && paso.pendiente.tipo).toBe('potrero')
  })
  it('explica un potrero inexistente aunque el modelo clasifique el mensaje como otro', () => {
    const a = arrancar(interpretacion({ intent: 'otro' }), ctx, 'En el 40 hay mucha agua')
    expect('respuesta' in a && a.respuesta).toContain('No encontré el potrero «40»')
    expect('borrador' in a).toBe(false)
  })
})

describe('ayuda y validación', () => {
  const pending: Pendiente = { tipo: 'propuesta', capturaId: 'cap', borrador: { tipo: 'lluvia', campoId: 'c', mm: 10, fecha: ctx.hoy } }
  for (const texto of ['ayuda', 'hola', '¿qué podés hacer?']) {
    it(`pedir ${texto} no abandona la carga`, () => {
      expect(leer({ texto }, pending, ctx).k).toBe('ayuda')
    })
  }
  it('una fecha futura no se cambia por hoy ni se propone guardar', () => {
    const paso = siguientePaso('cap', { tipo: 'lluvia', campoId: 'c', mm: 10, fecha: '2026-10-13' }, ctx)
    expect(paso.k).toBe('preguntar')
    expect('mensaje' in paso && paso.mensaje.texto).toContain('fecha')
    expect('pendiente' in paso && paso.pendiente.tipo).toBe('corregir')
  })
  it('un monto cero no se trata como si faltara el monto', () => {
    const paso = siguientePaso('cap', { tipo: 'gasto', campoId: 'c', monto: 0, categoriaId: 'gas', fecha: ctx.hoy }, ctx)
    expect(paso.k).toBe('preguntar')
    expect('mensaje' in paso && paso.mensaje.texto).toContain('mayor que cero')
  })
  it('una recorrida mantiene el día mostrado al confirmar después de medianoche', () => {
    const paso = siguientePaso('cap', { tipo: 'recorrida', observaciones: [{ potreroId: 'p', campoId: 'c', agua: null, pasto: 'escaso', electrico: null, conteo: null, novedad: null }] }, ctx)
    expect(paso.k).toBe('proponer')
    expect('borrador' in paso && paso.borrador.fecha).toBe(ctx.hoy)
  })
  it('una respuesta numérica negativa conserva el signo y vuelve a pedir el dato', () => {
    expect(numeroEn('-5 mm')).toBe(-5)
    expect(numeroEn('-45.000')).toBe(-45000)
    const p: Pendiente = { tipo: 'dato', capturaId: 'cap', dato: 'mm', borrador: { tipo: 'lluvia', campoId: 'c' } }
    const l = leer({ texto: '-5 mm' }, p, ctx)
    if (l.k !== 'seguir') throw new Error('Debe conservar el dato recibido')
    expect(siguientePaso('cap', l.borrador, ctx).k).toBe('preguntar')
  })
  it('la fecha imposible del modelo requiere corrección aunque el limpiador la descarte', () => {
    const a = arrancar(interpretacion({ intent: 'lluvia', mm: 5, fecha: '2026-02-31' }), ctx)
    if (!('borrador' in a)) throw new Error('Falta borrador')
    const paso = siguientePaso('cap', a.borrador, ctx)
    expect('pendiente' in paso && paso.pendiente.tipo).toBe('corregir')
  })
  it('una fecha corregida levanta la marca de fecha inválida', () => {
    const b = { tipo: 'lluvia' as const, campoId: 'c', mm: 5, fechaInvalida: true }
    // Se comprueba el flujo de corrección con una interpretación válida.
    const cambio = corregir(b, interpretacion({ intent: 'lluvia', fecha: '2026-10-11' }), ctx)
    expect(siguientePaso('cap', cambio, ctx).k).toBe('proponer')
  })
  it('mañana en el texto no se transforma en hoy si el modelo omite la fecha', () => {
    const a = arrancar(interpretacion({ intent: 'lluvia', mm: 7, campo: 'La Porteña' }), ctx, 'Llovieron 7 mm mañana en La Porteña')
    if (!('borrador' in a)) throw new Error('Falta borrador')
    expect(a.borrador.fecha).toBe('2026-10-13')
    expect(siguientePaso('cap', a.borrador, ctx).k).toBe('preguntar')
  })
  it('ayer en una corrección se respeta aunque el modelo siga devolviendo hoy', () => {
    const b = corregir({ tipo: 'lluvia', campoId: 'c', mm: 7, fecha: '2026-10-13' }, interpretacion({ intent: 'lluvia', fecha: ctx.hoy }), ctx, 'Fue ayer')
    expect(b.fecha).toBe('2026-10-11')
    expect(siguientePaso('cap', b, ctx).k).toBe('proponer')
  })
  it('una corrección con dos fechas distintas pide aclaración', () => {
    const b = corregir({ tipo: 'lluvia', campoId: 'c', mm: 7, fecha: ctx.hoy }, interpretacion({ intent: 'lluvia', fecha: ctx.hoy }), ctx, 'Fue ayer o hoy')
    expect('pendiente' in siguientePaso('cap', b, ctx) && b.fechaInvalida).toBe(true)
  })
  it('los montos conservan centavos en propuestas y resúmenes', () => {
    expect(pesos(1200.5)).toBe('$1.200,50')
    expect(pesos(-1200.05)).toBe('-$1.200,05')
    expect(resumenGastos(ctx.hoy, ctx.hoy, [{ campo: 'La Porteña', categoria: 'Combustible', cantidad: 1, total: 1200.5 }])).toContain('$1.200,50')
  })
})

describe('ubicación', () => {
  const left = { id: 'l', nombre: '1', campoId: 'c', campo: 'Campo', poligono: [[0, 0], [0, 1], [1, 1], [1, 0]] as [number, number][] }
  const right = { ...left, id: 'r', nombre: '2', poligono: [[0, 1], [0, 2], [1, 2], [1, 1]] as [number, number][] }
  it('un borde compartido es ambiguo, no elige un lado al azar', () => {
    expect(potreroEnPunto(0.5, 1, [left, right])).toBeNull()
  })
  it('un borde exterior de un único potrero pertenece a ese potrero', () => {
    expect(potreroEnPunto(0.5, 1, [left])?.id).toBe('l')
  })
  it('rechaza coordenadas fuera del planeta', () => {
    const invalido = { ...left, poligono: [[99, 0], [99, 1], [100, 1], [100, 0]] as [number, number][] }
    expect(potreroEnPunto(99.5, 0.5, [invalido])).toBeNull()
  })
})

describe('propuestas y respuestas completas', () => {
  it('una propuesta larga muestra todo antes de los botones', () => {
    const texto = 'Observación completa\n'.repeat(300)
    const partes = prepararMensajes({ texto, botones: [{ id: 'cap|si', titulo: 'Sí' }] })
    expect(partes.length).toBeGreaterThan(2)
    expect(partes.slice(0, -1).map((p) => p.texto).join('')).toBe(texto)
    expect(partes.slice(0, -1).every((p) => !p.botones && p.texto.length <= 4096)).toBe(true)
    expect(partes.at(-1)?.botones?.[0].id).toBe('cap|si')
    expect((payload('549', partes.at(-1)!) as { interactive: { body: { text: string } } }).interactive.body.text.length).toBeLessThanOrEqual(1024)
  })
  it('una respuesta larga se divide sin perder texto ni cortar un emoji', () => {
    const texto = 'a'.repeat(4095) + '🐮' + 'b'.repeat(5000)
    const partes = prepararMensajes({ texto })
    expect(partes.map((p) => p.texto).join('')).toBe(texto)
    expect(partes.every((p) => p.texto.length <= 4096 && !/[\uD800-\uDBFF]$/.test(p.texto))).toBe(true)
  })
  it('una consulta vacía informa que falta evidencia, sin inventar estados', () => {
    expect(resumenRecorrida(ctx.hoy, [])).toContain('no tengo campos')
    expect(ultimaObservacion(null, '3B', 'La Porteña')).toContain('No tengo observaciones')
    expect(novedades(ctx.hoy, ctx.hoy, [])).toContain('No tengo novedades')
    expect(resumenGastos(ctx.hoy, ctx.hoy, [])).toContain('No tengo gastos')
    expect(cargasRecientes([])).toContain('No encontré cargas')
  })
  it('el gasto consultado declara período, total y criterio contable', () => {
    const texto = resumenGastos('2026-10-01', ctx.hoy, [{ campo: 'La Porteña', categoria: 'Combustible', total: 45000, cantidad: 1 }])
    expect(texto).toContain('$45.000')
    expect(texto).toContain('fecha de devengo')
    expect(texto).toContain('excluyo anulados')
  })
  it('los potreros pendientes salen de observaciones guardadas', () => {
    const texto = resumenRecorrida(ctx.hoy, [{ campo: 'La Porteña', recorridos: 1, total: 3, pendientes: ['2B', '3B'] }])
    expect(texto).toContain('1 de 3')
    expect(texto).toContain('Faltan: 2B, 3B')
  })
  it('las novedades no se presentan como incidentes aún abiertos', () => {
    expect(novedades(ctx.hoy, ctx.hoy, [{ fecha: ctx.hoy, campo: 'La Porteña', potrero: '3B', novedad: 'molino roto' }])).toContain('no indica si ya se resolvieron')
  })
  it('esta semana comienza el lunes, en vez de retroceder siempre siete días', () => {
    expect(inicioSemana('2026-10-12')).toBe('2026-10-12')
    expect(inicioSemana('2026-10-11')).toBe('2026-10-05')
    expect(inicioSemana('2026-01-01')).toBe('2025-12-29')
  })
  it('los potreros pendientes se leen en orden numérico', () => {
    expect(resumenRecorrida(ctx.hoy, [{ campo: 'La Porteña', recorridos: 0, total: 3, pendientes: ['10B', '1B', '3B'] }])).toContain('Faltan: 1B, 3B, 10B')
  })
})
