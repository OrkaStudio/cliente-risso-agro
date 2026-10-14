import { describe, expect, it } from 'vitest'
import { botonId, corregir, leer, siguientePaso, arrancar } from './conversacion.ts'
import { limpiarInterpretacion, pistaTranscripcion } from './interpretar.ts'
import { resolverCampo, resolverCategoria, resolverPotrero } from './resolver.ts'
import { diasEnPotrero, gastoAnotado, hacienda, lluviaAnotada, trasGasto, trasLluvia, vencimientos } from './respuestas.ts'
import { cuandoTexto, finDeMes, hoyAR, numeroEn, pesos, sumarDias } from './texto.ts'
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
    expect(p.mensaje.texto).toBe('¿En qué campo registro *22 mm*, hoy? Al elegirlo queda guardado.')
    expect(p.mensaje.lista?.filas).toHaveLength(4)
    expect(p.mensaje.lista?.filas[1].id).toBe('c1|cl=lp@2026-09-24@22')
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
  it('una fecha futura requiere corrección y conserva el dato original', () => {
    const p = siguientePaso('c1', { tipo: 'lluvia', mm: 10, campoId: 'to', fecha: '2026-10-10' }, ctx)
    expect(p.k).toBe('preguntar')
    expect('pendiente' in p && p.pendiente).toMatchObject({ tipo: 'corregir', borrador: { fecha: '2026-10-10' } })
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
  describe('un campo leído como a quién se le pagó (QA 12/10: "45mil en gasoil para don gilberto")', () => {
    const gasto = (extra: Record<string, unknown>) => ({
      ...limpiarInterpretacion({ intent: 'gasto' }), monto: 45000, categoria: 'Combustible', descripcion: 'gasoil', ...extra,
    })

    it('es el campo, y la propuesta no pregunta el campo ni dice "a Don Gilberto"', () => {
      const r = arrancar(gasto({ contraparte: 'Don Gilberto' }), ctx)
      if (!('borrador' in r)) throw new Error('Debe armar borrador')
      expect(r.borrador).toMatchObject({ campoMencion: 'Don Gilberto', contraparte: null })
      const paso = siguientePaso('c', r.borrador, ctx)
      expect(paso.k).toBe('proponer')
      if (paso.k !== 'proponer') return
      expect(paso.borrador.campoId).toBe('dg')
      expect(paso.mensaje.texto).not.toContain('a Don Gilberto')
    })
    it('si nombró el mismo campo, la contraparte repetida se borra', () => {
      const r = arrancar(gasto({ campo: 'don gilberto', contraparte: 'Don Gilberto' }), ctx)
      expect('borrador' in r && r.borrador).toMatchObject({ campoMencion: 'don gilberto', contraparte: null })
    })
    it('un nombre parecido a un campo sigue siendo una persona', () => {
      const r = arrancar(gasto({ contraparte: 'Gilberto' }), ctx)
      expect('borrador' in r && r.borrador).toMatchObject({ campoMencion: null, contraparte: 'Gilberto' })
    })
    it('si nombró otro campo, no adivina', () => {
      const r = arrancar(gasto({ campo: 'La Porteña', contraparte: 'Toimil' }), ctx)
      expect('borrador' in r && r.borrador).toMatchObject({ campoMencion: 'La Porteña', contraparte: 'Toimil' })
    })
    it('en una corrección también: "era para Los Pampas" cambia el campo', () => {
      const b = corregir(
        { tipo: 'gasto', monto: 45000, campoId: 'dg', contraparte: 'YPF', fecha: '2026-10-12' },
        { ...limpiarInterpretacion({ intent: 'gasto' }), contraparte: 'Los Pampas' },
        ctx,
      )
      expect(b).toMatchObject({ campoMencion: 'Los Pampas', campoId: null, contraparte: 'YPF' })
    })
  })
  describe('el campo nombrado en el mensaje, si el modelo no lo completó (QA 12/10, audio)', () => {
    const audio = 'Gasté treinta mil en el veterinario para el campo Toimil.'
    const it0 = {
      ...limpiarInterpretacion({ intent: 'gasto' }), monto: 30000, categoria: 'Medicamentos / veterinario', contraparte: 'veterinario',
    }

    it('lo toma del texto y la propuesta no pregunta el campo', () => {
      const r = arrancar(it0, ctx, audio)
      if (!('borrador' in r)) throw new Error('Debe armar borrador')
      expect(r.borrador).toMatchObject({ campoMencion: 'Toimil', contraparte: 'veterinario' })
      const paso = siguientePaso('c', r.borrador, ctx)
      expect(paso.k === 'proponer' && paso.borrador.campoId).toBe('to')
    })
    it('con artículo, tildes y mayúsculas distintas', () => {
      const r = arrancar({ ...limpiarInterpretacion({ intent: 'lluvia' }), mm: 10 }, ctx, 'llovieron 10 en la PORTENA')
      expect('borrador' in r && r.borrador.campoMencion).toBe('La Porteña')
    })
    it('si nombra dos campos, no adivina', () => {
      const r = arrancar(it0, ctx, 'gasté 30 mil, 15 en Toimil y 15 en Los Pampas')
      expect('borrador' in r && r.borrador.campoMencion).toBeNull()
    })
    it('sólo palabras enteras: "toimilense" no es Toimil', () => {
      const r = arrancar(it0, ctx, 'gasté 30 mil en el veterinario toimilense')
      expect('borrador' in r && r.borrador.campoMencion).toBeNull()
    })
    it('lo que nombró el modelo manda sobre el texto', () => {
      const r = arrancar({ ...it0, campo: 'Los Pampas' }, ctx, 'para Toimil no, para Los Pampas')
      expect('borrador' in r && r.borrador.campoMencion).toBe('Los Pampas')
    })
    it('en una corrección: "no, era para Los Pampas"', () => {
      const b = corregir(
        { tipo: 'gasto', monto: 35000, campoId: 'to', fecha: '2026-10-12' },
        limpiarInterpretacion({ intent: 'gasto' }),
        ctx,
        'no, era para Los Pampas',
      )
      expect(b).toMatchObject({ campoMencion: 'Los Pampas', campoId: null, monto: 35000 })
    })
    it('una corrección sin campo no lo toca', () => {
      const b = corregir({ tipo: 'gasto', monto: 30000, campoId: 'to' }, { ...limpiarInterpretacion({ intent: 'gasto' }), monto: 35000 }, ctx, 'Eran 35mil')
      expect(b).toMatchObject({ campoId: 'to', monto: 35000 })
    })
  })
  describe('preguntas que explican lo que falta', () => {
    it('un campo que no existe se nombra en la pregunta', () => {
      const paso = siguientePaso('c', { tipo: 'gasto', monto: 1000, categoriaId: 'comb', campoMencion: 'Las Toscas' }, ctx)
      expect(paso.k === 'preguntar' && paso.mensaje.texto).toBe('No encontré el campo «Las Toscas». ¿De qué campo es el gasto de *$1.000*?')
    })
    it('también en la lluvia que se guarda al elegir', () => {
      const paso = siguientePaso('c', { tipo: 'lluvia', mm: 10, campoMencion: 'Las Toscas' }, ctx)
      expect(paso.k === 'preguntar' && paso.mensaje.texto).toBe(
        'No encontré el campo «Las Toscas». ¿En qué campo registro *10 mm*, hoy? Al elegirlo queda guardado.',
      )
    })
    it('las preguntas del gasto muestran el monto', () => {
      const sinCampo = siguientePaso('c', { tipo: 'gasto', monto: 45000, categoriaId: 'comb' }, ctx)
      expect(sinCampo.k === 'preguntar' && sinCampo.mensaje.texto).toBe('¿De qué campo es el gasto de *$45.000*?')
      const sinCategoria = siguientePaso('c', { tipo: 'gasto', monto: 45000, campoId: 'dg' }, ctx)
      expect(sinCategoria.k === 'preguntar' && sinCategoria.mensaje.texto).toBe('¿En qué categoría anoto el gasto de *$45.000*?')
      const sinMonto = siguientePaso('c', { tipo: 'gasto', categoriaId: 'comb' }, ctx)
      expect(sinMonto.k === 'preguntar' && sinMonto.mensaje.texto).toBe('¿De qué campo es el gasto?')
    })
    it('con más de 10 categorías avisa que se puede escribir la que no entra, y escrita se toma', () => {
      const muchas = Array.from({ length: 11 }, (_, i) => ({ id: `k${i + 1}`, nombre: `Categoría ${i + 1}` }))
      const ctx11 = { ...ctx, categoriasGasto: muchas }
      const paso = siguientePaso('c', { tipo: 'gasto', monto: 1000, campoId: 'dg' }, ctx11)
      if (paso.k !== 'preguntar') throw new Error('Debe preguntar la categoría')
      expect(paso.mensaje.lista?.filas).toHaveLength(10)
      expect(paso.mensaje.texto).toContain('Si no está en la lista, escribime el nombre.')
      const l = leer({ texto: 'categoría 11' }, paso.pendiente, ctx11)
      expect(l.k === 'seguir' && l.borrador.categoriaId).toBe('k11')
    })
    it('con 10 o menos no agrega el aviso', () => {
      const paso = siguientePaso('c', { tipo: 'gasto', monto: 1000, campoId: 'dg' }, ctx)
      expect(paso.k === 'preguntar' && paso.mensaje.texto).not.toContain('escribime')
    })
  })
  it('lo que no se carga por acá no arma borrador', () => {
    const r = arrancar({ ...limpiarInterpretacion({}), intent: 'no_soportado' }, ctx)
    expect('respuesta' in r && r.estado).toBe('descartada')
  })
  it('"¿cómo cargo un gasto?" explica la foto del ticket, con los campos de la empresa', () => {
    const r = arrancar({ ...limpiarInterpretacion({}), intent: 'ayuda_gasto' }, ctx)
    expect('respuesta' in r && r.estado).toBe('respondida')
    const txt = 'respuesta' in r ? r.respuesta : ''
    expect(txt).toContain('*foto del ticket o la factura*')
    expect(txt).toContain('"gasoil, Don Gilberto"')
  })
  it('la ayuda de lluvia no inventa campos si la empresa tiene uno solo', () => {
    const r = arrancar({ ...limpiarInterpretacion({}), intent: 'ayuda_lluvia' }, ctxUnCampo)
    const txt = 'respuesta' in r ? r.respuesta : ''
    expect(txt).toContain('"llovieron 20 mm en Toimil"')
    expect(txt).toContain('"ayer 15 en Toimil"')
  })
})

describe('respuestas', () => {
  it('lluvia: dice lo que anotó y después el mes, con comparación', () => {
    expect(trasLluvia({ campo: 'Toimil', mm: 12, fecha: '2026-09-24', hoy: '2026-09-24', mesMm: 87, anteriorMm: 61 })).toBe(
      'Listo, anoté *12 mm* hoy en Toimil. En septiembre van 87; el año pasado a esta altura iban 61.',
    )
  })
  it('lluvia: la carga del QA del 12/10 ya no muestra sólo el acumulado', () => {
    expect(trasLluvia({ campo: 'Los Pampas', mm: 10, fecha: '2026-10-12', hoy: '2026-10-12', mesMm: 30, anteriorMm: null })).toBe(
      'Listo, anoté *10 mm* hoy en Los Pampas. En octubre van 30.',
    )
  })
  it('lluvia: la primera del mes no repite el total', () => {
    expect(trasLluvia({ campo: 'Toimil', mm: 10, fecha: '2026-10-12', hoy: '2026-10-12', mesMm: 10, anteriorMm: null })).toBe(
      'Listo, anoté *10 mm* hoy en Toimil. Es la primera de octubre.',
    )
  })
  it('lluvia: la de ayer cargada el 1° cuenta en su mes, entero', () => {
    expect(trasLluvia({ campo: 'Toimil', mm: 15, fecha: '2026-09-30', hoy: '2026-10-01', mesMm: 102, anteriorMm: 61 })).toBe(
      'Listo, anoté *15 mm* ayer en Toimil. En septiembre fueron 102; el año pasado, 61.',
    )
    expect(trasLluvia({ campo: 'Toimil', mm: 15, fecha: '2026-09-30', hoy: '2026-10-01', mesMm: 15, anteriorMm: null })).toBe(
      'Listo, anoté *15 mm* ayer en Toimil. Es la única de septiembre.',
    )
  })
  it('lluvia de otro año dice el año', () => {
    expect(trasLluvia({ campo: 'Toimil', mm: 8, fecha: '2025-12-31', hoy: '2026-01-02', mesMm: 40, anteriorMm: null })).toBe(
      'Listo, anoté *8 mm* el mié 31/12 en Toimil. En diciembre de 2025 fueron 40.',
    )
  })
  it('si falla el resumen, igual dice lo que anotó', () => {
    expect(lluviaAnotada({ campo: 'Los Pampas', mm: 12.5, fecha: '2026-10-12', hoy: '2026-10-12' })).toBe(
      'Listo, anoté *12,5 mm* hoy en Los Pampas.',
    )
  })
  it('fin de mes, también en febrero bisiesto', () => {
    expect(finDeMes('2026-09-05')).toBe('2026-09-30')
    expect(finDeMes('2028-02-10')).toBe('2028-02-29')
    expect(finDeMes('2025-12-31')).toBe('2025-12-31')
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
  const g = { monto: 45000, campo: 'Don Gilberto', categoria: 'Combustible' }
  it('gasto: dice lo que anotó y después el total del mes (QA 12/10)', () => {
    expect(trasGasto({ ...g, fecha: '2026-10-12', hoy: '2026-10-12', total: 90000, cantidad: 2, fotoGuardada: null })).toBe(
      'Listo, anoté *$45.000* de Combustible en Don Gilberto, pagado hoy. En octubre llevás $90.000 en Combustible (2 cargas).',
    )
  })
  it('gasto: el primero de la categoría en el mes no repite el monto', () => {
    expect(trasGasto({ ...g, fecha: '2026-10-12', hoy: '2026-10-12', total: 45000, cantidad: 1, fotoGuardada: null })).toBe(
      'Listo, anoté *$45.000* de Combustible en Don Gilberto, pagado hoy. Es el primer gasto de Combustible en octubre.',
    )
  })
  it('el gasto suma en su mes, no en el de hoy (ticket del 29/09 cargado en octubre)', () => {
    const txt = trasGasto({ ...g, monto: 162046, fecha: '2026-09-29', hoy: '2026-10-02', total: 300000, cantidad: 3, fotoGuardada: true })
    expect(txt).toBe('Listo, anoté *$162.046* de Combustible en Don Gilberto, pagado el mar 29/09. En septiembre llevás $300.000 en Combustible (3 cargas).')
  })
  it('un gasto de otro año dice el año', () => {
    const txt = trasGasto({ ...g, monto: 2500, fecha: '2025-12-30', hoy: '2026-01-03', total: 5000, cantidad: 2, fotoGuardada: null })
    expect(txt).toContain('En diciembre de 2025 llevás $5.000 en Combustible (2 cargas).')
  })
  it('si la foto no se guardó, lo dice', () => {
    const txt = trasGasto({ ...g, fecha: '2026-10-01', hoy: '2026-10-02', total: 1000, cantidad: 1, fotoGuardada: false })
    expect(txt).toContain('*no pude guardar la foto*')
    expect(trasGasto({ ...g, fecha: '2026-10-01', hoy: '2026-10-02', total: 1000, cantidad: 1, fotoGuardada: null })).not.toContain('foto')
  })
  it('si falla el resumen del gasto, igual dice lo que anotó', () => {
    expect(gastoAnotado({ ...g, fecha: '2026-10-11', hoy: '2026-10-12' })).toBe('Listo, anoté *$45.000* de Combustible en Don Gilberto, pagado ayer.')
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
