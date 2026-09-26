import { describe, expect, it } from 'vitest'
import { botonId, corregir, leer, siguientePaso, arrancar } from './conversacion.ts'
import { limpiarInterpretacion, pistaTranscripcion } from './interpretar.ts'
import { resolverCampo, resolverCategoria, resolverPotrero } from './resolver.ts'
import { diasEnPotrero, hacienda, trasLluvia, vencimientos } from './respuestas.ts'
import { cuandoTexto, hoyAR, numeroEn, pesos, sumarDias } from './texto.ts'
import type { Campo, Contexto, Pendiente } from './tipos.ts'

// Los campos y potreros de "Orka Pruebas" (número + letra del campo).
const pot = (campo: string, letra: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${campo}-${i + 1}${letra}`, nombre: `${i + 1}${letra}` }))
const CAMPOS: Campo[] = [
  { id: 'dg', nombre: 'Don Gilberto', potreros: pot('dg', 'A', 3) },
  { id: 'lp', nombre: 'La Porteña', potreros: pot('lp', 'B', 12) },
  { id: 'to', nombre: 'Toimil', potreros: pot('to', 'C', 5) },
  { id: 'pa', nombre: 'Los Pampas', potreros: pot('pa', 'D', 4) },
]
const CATS = [
  { id: 'comb', nombre: 'Combustible' },
  { id: 'vet', nombre: 'Medicamentos / veterinario' },
  { id: 'imp', nombre: 'Impuestos' },
]
const ctx: Contexto = { hoy: '2026-09-24', nombre: 'Daniel', campos: CAMPOS, categoriasGasto: CATS }
const ctxUnCampo: Contexto = { ...ctx, campos: [CAMPOS[2]] }

describe('texto', () => {
  it('hoy en Argentina, no en UTC', () => {
    // 02:30 UTC del 25 = 23:30 del 24 en Argentina.
    expect(hoyAR(new Date('2026-09-25T02:30:00Z'))).toBe('2026-09-24')
    expect(hoyAR(new Date('2026-09-25T03:30:00Z'))).toBe('2026-09-25')
  })
  it('números como se escriben acá', () => {
    expect(numeroEn('gasté 80 mil de gasoil')).toBe(80000)
    expect(numeroEn('$184.500')).toBe(184500)
    expect(numeroEn('12,5')).toBe(12.5)
    expect(numeroEn('llovieron 22 en la porteña')).toBe(22)
    expect(numeroEn('nada')).toBeNull()
  })
  it('fechas y plata', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(cuandoTexto('2026-09-23', '2026-09-24')).toBe('ayer')
    expect(cuandoTexto('2026-09-26', '2026-09-24')).toBe('el sáb 26/09')
    expect(pesos(3096000)).toBe('$3.096.000')
  })
})

describe('resolver', () => {
  it('campos con o sin artículo', () => {
    expect(resolverCampo('la porteña', CAMPOS)).toEqual({ ok: CAMPOS[1] })
    expect(resolverCampo('portena', CAMPOS)).toEqual({ ok: CAMPOS[1] })
    expect(resolverCampo('pampas', CAMPOS)).toEqual({ ok: CAMPOS[3] })
    expect(resolverCampo('el ombú', CAMPOS)).toEqual({ ninguno: true })
  })
  it('"el 5" existe en dos campos: no se adivina', () => {
    const r = resolverPotrero('5', CAMPOS)
    expect('varios' in r && r.varios.map((x) => x.potrero.nombre)).toEqual(['5B', '5C'])
  })
  it('con la letra o con el campo, es uno solo', () => {
    const a = resolverPotrero('el 5b', CAMPOS)
    expect('ok' in a && a.ok.potrero.id).toBe('lp-5B')
    const b = resolverPotrero('potrero 5', CAMPOS, 'to')
    expect('ok' in b && b.ok.potrero.id).toBe('to-5C')
    expect(resolverPotrero('9', CAMPOS, 'to')).toEqual({ ninguno: true })
  })
  it('categorías por nombre o por parte del nombre', () => {
    expect(resolverCategoria('veterinario', CATS)?.id).toBe('vet')
    expect(resolverCategoria('Combustible', CATS)?.id).toBe('comb')
    expect(resolverCategoria('ropa', CATS)).toBeNull()
  })
})

describe('interpretación del modelo', () => {
  it('la pista del audio lleva los nombres propios de la empresa', () => {
    const p = pistaTranscripcion(ctx)
    expect(p).toContain('Toimil (potreros 1C, 2C, 3C, 4C, 5C)')
    expect(p.length).toBeLessThanOrEqual(700)
  })
  it('no se confía en lo que vuelve', () => {
    expect(limpiarInterpretacion({ intent: 'borrar_todo', mm: -3, fecha: '2026-02-31', potrero: 5 })).toMatchObject({
      intent: 'otro',
      mm: null,
      fecha: null,
      potrero: '5',
    })
    expect(limpiarInterpretacion(null).intent).toBe('otro')
  })
})

describe('conversación', () => {
  it('lluvia sin campo, con cuatro campos: pregunta con una lista', () => {
    const p = siguientePaso('c1', { tipo: 'lluvia', mm: 22 }, ctx)
    expect(p.k).toBe('preguntar')
    if (p.k !== 'preguntar') return
    expect(p.mensaje.texto).toBe('¿En qué campo llovieron 22 mm?')
    expect(p.mensaje.lista?.filas).toHaveLength(4)
    expect(p.mensaje.lista?.filas[1].id).toBe('c1|c=lp')
  })
  it('con un solo campo no pregunta: propone', () => {
    const p = siguientePaso('c1', { tipo: 'lluvia', mm: 22 }, ctxUnCampo)
    expect(p.k).toBe('proponer')
    if (p.k !== 'proponer') return
    expect(p.mensaje.texto).toBe('Anoto *22 mm en Toimil*, hoy.')
    expect(p.mensaje.botones?.map((b) => b.titulo)).toEqual(['Sí', 'Corregir', 'Cancelar'])
  })
  it('potrero ambiguo: pregunta entre los candidatos', () => {
    const p = siguientePaso('c2', { tipo: 'consulta_dias_potrero', potreroMencion: '5' }, ctx)
    expect(p.k).toBe('preguntar')
    if (p.k !== 'preguntar') return
    expect(p.mensaje.texto).toBe('Hay un potrero 5 en La Porteña y en Toimil. ¿Cuál es?')
    expect(p.mensaje.botones?.map((b) => b.titulo)).toEqual(['5B · La Porteña', '5C · Toimil'])
  })
  it('gasto sin categoría: pregunta la categoría', () => {
    const p = siguientePaso('c3', { tipo: 'gasto', monto: 80000, campoId: 'to' }, ctx)
    expect(p.k === 'preguntar' && p.pendiente.tipo).toBe('categoria')
  })
  it('gasto completo: propone con los datos resueltos', () => {
    const p = siguientePaso('c3', { tipo: 'gasto', monto: 184500, campoId: 'to', categoriaId: 'comb', contraparte: 'Estación Ruta 3' }, ctx)
    expect(p.k === 'proponer' && p.mensaje.texto).toBe(
      'Anoto un *gasto de $184.500* a Estación Ruta 3\nCombustible · Toimil · pagado hoy',
    )
  })
  it('una fecha futura no se acepta: queda hoy', () => {
    const p = siguientePaso('c1', { tipo: 'lluvia', mm: 10, campoId: 'to', fecha: '2026-10-10' }, ctx)
    expect(p.k === 'proponer' && p.borrador.fecha).toBe('2026-09-24')
  })

  const propuesta: Pendiente = { tipo: 'propuesta', capturaId: 'c1', borrador: { tipo: 'lluvia', mm: 22, campoId: 'to' } }
  it('el botón Sí confirma sólo su propia propuesta', () => {
    expect(leer({ botonId: botonId('c1', 'si') }, propuesta, ctx).k).toBe('confirmar')
    expect(leer({ botonId: botonId('c0', 'si') }, propuesta, ctx).k).toBe('viejo')
    expect(leer({ botonId: botonId('c1', 'si') }, null, ctx).k).toBe('viejo')
  })
  it('"sí" escrito confirma; "no" cancela; "no, eran 25" corrige', () => {
    expect(leer({ texto: 'Sí' }, propuesta, ctx).k).toBe('confirmar')
    expect(leer({ texto: 'dale' }, propuesta, ctx).k).toBe('confirmar')
    expect(leer({ texto: 'no' }, propuesta, ctx).k).toBe('cancelar')
    expect(leer({ texto: 'no, eran 25' }, propuesta, ctx).k).toBe('reinterpretar')
  })
  it('otro tema deja la propuesta incompleta', () => {
    expect(leer({ texto: 'cuántas vacas hay?' }, propuesta, ctx)).toEqual({ k: 'nuevo', abandona: 'c1' })
  })
  it('responder el dato que faltaba', () => {
    const p: Pendiente = { tipo: 'dato', capturaId: 'c4', borrador: { tipo: 'lluvia', campoId: 'to' }, dato: 'mm' }
    const l = leer({ texto: '25' }, p, ctx)
    expect(l.k === 'seguir' && l.borrador.mm).toBe(25)
  })
  it('elegir campo escribiendo el nombre', () => {
    const p: Pendiente = { tipo: 'campo', capturaId: 'c5', borrador: { tipo: 'lluvia', mm: 10 } }
    const l = leer({ texto: 'en toimil' }, p, ctx)
    expect(l.k === 'seguir' && l.borrador.campoId).toBe('to')
  })
  it('una corrección pisa sólo lo que cambió', () => {
    const b = corregir(
      { tipo: 'lluvia', mm: 22, campoId: 'to', fecha: '2026-09-24' },
      { ...limpiarInterpretacion({ intent: 'lluvia' }), mm: 25 },
      ctx,
    )
    expect(b).toMatchObject({ mm: 25, campoId: 'to', fecha: '2026-09-24' })
  })
  it('lo que no se carga por acá no arma borrador', () => {
    const r = arrancar({ ...limpiarInterpretacion({}), intent: 'no_soportado' }, ctx)
    expect('respuesta' in r && r.estado).toBe('descartada')
  })
})

describe('respuestas', () => {
  it('lluvia con comparación', () => {
    expect(trasLluvia({ campo: 'Toimil', hoy: '2026-09-24', mesMm: 87, anteriorMm: 61 })).toBe(
      'Listo. Van *87 mm* en septiembre en Toimil; el año pasado a esta altura iban 61.',
    )
  })
  it('hacienda de un campo, por potrero', () => {
    const txt = hacienda(
      [
        { campo: 'Toimil', potrero: '1C', categoria: 'vaca', cabezas: 85 },
        { campo: 'Toimil', potrero: '1C', categoria: 'ternero', cabezas: 70 },
        { campo: 'Toimil', potrero: '3C', categoria: 'novillo', cabezas: 1 },
      ],
      { campo: 'Toimil' },
    )
    expect(txt).toBe('En Toimil hay *156 cabezas*: 85 vacas, 70 terneros, 1 novillo.\n• 1C: 85 vacas, 70 terneros\n• 3C: 1 novillo')
  })
  it('vencimientos con totales', () => {
    const txt = vencimientos('2026-09-24', '2026-10-01', [
      { fecha: '2026-09-26', tipo: 'gasto', monto: 450000, descripcion: 'Cuota tractor', contraparte: null, categoria: null },
      { fecha: '2026-09-30', tipo: 'ingreso', monto: 3200000, descripcion: null, contraparte: 'Consignataria', categoria: null },
    ])
    expect(txt).toContain('• el sáb 26/09: Cuota tractor · $450.000')
    expect(txt).toContain('A pagar: *$450.000* · A cobrar: *$3.200.000*')
  })
  it('días en el potrero', () => {
    expect(diasEnPotrero('2026-09-24', { campo: 'Toimil', potrero: '3C', grupos: [{ desde: '2026-07-15', cabezas: 95 }] })).toBe(
      'Los 95 animales del 3C de Toimil están desde el 15/07: hace *71 días*.',
    )
  })
})
