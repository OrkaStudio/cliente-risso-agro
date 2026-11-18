import type { EstadoCarga } from '../_shared/wa/confirmacion.ts'
import { arrancar, corregir, detalleObs, esCharla, leer, siguientePaso } from '../_shared/wa/conversacion.ts'
import { nombraHacienda } from '../_shared/wa/consulta-lluvia.ts'
import { limpiarInterpretacion } from '../_shared/wa/interpretar.ts'
import { campoExacto, campoPorId, potreroPorId, resolverReferenciaPotrero } from '../_shared/wa/resolver.ts'
import { norm } from '../_shared/wa/texto.ts'
import type { AspectoRecorrida, Borrador, Contexto, Mensaje, ObsBorrador, PasoTurno, Pendiente, PendienteTurno } from '../_shared/wa/tipos.ts'
import * as db from './db.ts'
import { interpretar } from './llm.ts'
import { accesoDenegado, puedeMandar, seccionDe } from '../_shared/wa/permisos.ts'

export type IOCompuesto = {
  responder: (mensaje: Mensaje) => Promise<void>
  conversar: (texto: string, motivo: 'saludo' | 'otro') => Promise<string>
  consultar: (borrador: Borrador) => Promise<string>
  confirmar: (capturaId: string, borrador: Borrador, pendiente: Pendiente,
    turno: PendienteTurno, siguiente: db.Vinculo['pendiente']) => Promise<EstadoCarga | null>
}

type Preparado = ({ paso: PasoTurno } | { aviso: string }) & { cambio: db.CambioCaptura }
export type BorradorTurno = { capturaId: string; borrador: Borrador }

async function preparar(ctx: Contexto, { capturaId, borrador }: BorradorTurno, io: IOCompuesto): Promise<Preparado> {
  const paso = siguientePaso(capturaId, borrador, ctx, true)
  if (paso.k === 'consultar') {
    let aviso: string
    try {
      aviso = await io.consultar(paso.borrador)
    } catch (e) {
      console.error('wa-webhook consulta en turno compuesto', e)
      return {
        aviso: 'Esa consulta no está disponible ahora. Podés pedirla de nuevo mientras seguimos con las otras cargas.',
        cambio: { estado: 'error', propuesta: paso.borrador, notas: paso.notas },
      }
    }
    return { aviso, cambio: { estado: 'respondida', propuesta: paso.borrador, notas: paso.notas } }
  }
  if (paso.k === 'decir') {
    return { aviso: paso.mensaje.texto, cambio: { estado: 'descartada', notas: paso.notas } }
  }
  if (paso.pendiente.tipo === 'ubicado') throw new Error('Paso de turno sin captura')
  if (paso.pendiente.tipo === 'propuesta') {
    const revision = crypto.randomUUID()
    const mensaje = { ...paso.mensaje, botones: paso.mensaje.botones?.map(b => ({ ...b, id: b.id + '=' + revision })) }
    return {
      paso: { pendiente: { ...paso.pendiente, revision }, mensaje },
      cambio: { estado: 'propuesta', propuesta: paso.pendiente.borrador, notas: paso.notas },
    }
  }
  return {
    paso: { pendiente: paso.pendiente, mensaje: paso.mensaje },
    cambio: { estado: 'incompleta', propuesta: paso.pendiente.borrador, notas: paso.notas },
  }
}

async function mostrar(estado: db.Vinculo['pendiente'], avisos: string[], io: IOCompuesto): Promise<void> {
  const actual = estado?.tipo === 'turno' ? estado.pasos[0]?.mensaje : null
  const otros = estado?.tipo === 'turno' ? estado.pasos.length - 1 : 0
  const adicionales = estado?.tipo === 'turno' ? estado.pasos.slice(1).map(p => p.mensaje.texto) : []
  const instrucciones = otros > 0 ? 'Podés revisar todas las cargas acá. El botón confirma la primera. Para elegir otra, escribí «siguiente pendiente».' : ''
  const texto = [...avisos, actual?.texto, ...adicionales, instrucciones].filter(Boolean).join('\n\n')
  if (texto) await io.responder({ ...actual, texto })
}

async function reemplazar(
  v: db.Vinculo, esperado: db.Vinculo['pendiente'], nuevo: db.Vinculo['pendiente'], io: IOCompuesto,
  capturas?: { id: string; cambio: db.CambioCaptura }[],
) {
  if (await db.reemplazarPendiente(v, esperado, nuevo, capturas)) return true
  await io.responder({ texto: 'El pendiente cambió mientras lo revisaba. Escribí «ver pendientes» para ver qué quedó.' })
  return false
}

function restantes(turno: PendienteTurno): db.Vinculo['pendiente'] {
  if (turno.pasos.length > 1) return { ...turno, pasos: turno.pasos.slice(1) }
  const anterior = turno.anterior
  if (anterior?.tipo === 'propuesta') return { tipo: 'corregir', capturaId: anterior.capturaId, borrador: anterior.borrador }
  return anterior
}

function avisoAnterior(turno: PendienteTurno): string[] {
  if (turno.pasos.length !== 1 || !turno.anterior) return []
  const anterior = turno.anterior
  return anterior.tipo === 'propuesta'
    ? [`Sigue pendiente la carga anterior. Escribí «retomar ${anterior.borrador.tipo}» para volver a verla.`]
    : ['También sigue pendiente lo que estabas haciendo antes.']
}

export async function incorporarTurno(
  v: db.Vinculo, ctx: Contexto, estado: db.Vinculo['pendiente'],
  borradores: BorradorTurno[], avisos: string[], io: IOCompuesto,
): Promise<void> {
  const nuevos: PasoTurno[] = []
  const capturas: { id: string; cambio: db.CambioCaptura }[] = []
  for (const b of borradores) {
    const resultado = await preparar(ctx, b, io)
    if ('paso' in resultado && estado?.tipo === 'turno') {
      const candidato = resultado.paso.pendiente.borrador
      const yaIncluida = candidato.tipo === 'recorrida' && candidato.observaciones?.length && estado.pasos.some(p => {
        const previo = p.pendiente.borrador
        return previo.tipo === 'recorrida' && previo.fecha === candidato.fecha && candidato.observaciones!.every(o =>
          previo.observaciones?.some(a => a.potreroId === o.potreroId && a.campoId === o.campoId
            && (['agua', 'pasto', 'electrico', 'conteo', 'novedad'] as const).every(k => o[k] == null || o[k] === a[k])))
      })
      if (yaIncluida) {
        capturas.push({ id: b.capturaId, cambio: { estado: 'respondida', notas: ['El dato ya estaba en una propuesta pendiente.'] } })
        continue
      }
    }
    capturas.push({ id: b.capturaId, cambio: resultado.cambio })
    if ('paso' in resultado) nuevos.push(resultado.paso)
    else avisos.push(resultado.aviso)
  }
  if (!nuevos.length) {
    for (const c of capturas) await db.actualizarCaptura(c.id, c.cambio)
    if (estado?.tipo === 'turno') await mostrar(estado, avisos, io)
    else if (avisos.length) await io.responder({ texto: avisos.join('\n\n') })
    return
  }
  const nuevo: PendienteTurno = estado?.tipo === 'turno'
    ? { ...estado, pasos: [...estado.pasos, ...nuevos] }
    : { tipo: 'turno', capturaId: null, pasos: nuevos, anterior: estado }
  if (await reemplazar(v, estado, nuevo, io, capturas)) await mostrar(nuevo, avisos, io)
}

export async function actualizarPasoTurno(
  v: db.Vinculo, ctx: Contexto, turno: PendienteTurno, b: BorradorTurno, io: IOCompuesto,
  esperado: db.Vinculo['pendiente'] = turno,
): Promise<void> {
  const resultado = await preparar(ctx, b, io)
  const nuevo = 'paso' in resultado ? { ...turno, pasos: [resultado.paso, ...turno.pasos.slice(1)] } : restantes(turno)
  const avisos = 'aviso' in resultado ? [resultado.aviso, ...avisoAnterior(turno)] : []
  if (await reemplazar(v, esperado, nuevo, io, [{ id: b.capturaId, cambio: resultado.cambio }])) await mostrar(nuevo, avisos, io)
}

type Reubicacion = { aspecto?: AspectoRecorrida | null; potrero: string | null; campo?: string | null }

const aspectos = {
  agua: { titulo: 'agua', referencia: /\b(?:aguada|agua|bebedero|tanque)\b/ },
  pasto: { titulo: 'pasto', referencia: /\b(?:pasto|pastura)\b/ },
  electrico: { titulo: 'eléctrico', referencia: /\b(?:electrico|boyero)\b/ },
  conteo: { titulo: 'conteo', referencia: /\b(?:conteo|recuento)\b/ },
  novedad: { titulo: 'novedad', referencia: /\b(?:novedad|nota)\b/ },
} satisfies Record<AspectoRecorrida, { titulo: string; referencia: RegExp }>

function reubicacionDirecta(texto: string): Reubicacion | null {
  const frase = /^(?:no[, ]+)?(?:lo (?:de|del|de la|de los|de las)|(?:el|la))\s+(.+?)\s+(?:era|fue)\s+en\s+(.+)$/.exec(texto)
  if (!frase) return null
  const candidatas = (Object.entries(aspectos) as [AspectoRecorrida, typeof aspectos.agua][])
    .filter(([, dato]) => dato.referencia.test(frase[1]))
  return candidatas.length === 1 ? { aspecto: candidatas[0][0], potrero: frase[2] } : null
}

/** Reubica el dato señalado y vuelve a emitir únicamente la propuesta afectada. */
export async function reubicarObservacion(
  v: db.Vinculo, ctx: Contexto, turno: PendienteTurno, pedido: Reubicacion, io: IOCompuesto,
): Promise<PendienteTurno | null> {
  const avisar = async (texto: string) => { await io.responder({ texto }); return null }
  if (!puedeMandar(ctx.permisos, 'campos')) return avisar(accesoDenegado('campos', 'cargar'))
  const aspecto = pedido.aspecto
  if (!aspecto) return avisar('¿Qué dato de la recorrida querés cambiar de potrero?')
  const titulo = aspectos[aspecto].titulo
  const posibles = turno.pasos.flatMap(({ pendiente }, paso) => (pendiente.borrador.tipo === 'recorrida'
    ? (pendiente.borrador.observaciones ?? []).flatMap((observacion, indice) =>
      observacion[aspecto] != null ? [{ pendiente, paso, observacion, indice }] : [])
    : []))
  if (!posibles.length) return avisar(`No tengo un dato de ${titulo} en la recorrida pendiente. ¿Cuál querés mover?`)
  if (posibles.length > 1) return avisar(`Hay varios datos de ${titulo} pendientes. ¿De qué potrero es el que querés corregir?`)
  if (!pedido.potrero) return avisar(`¿En qué potrero fue lo de ${titulo}?`)
  const [{ pendiente, paso, observacion, indice }] = posibles
  const campo = pedido.campo ? campoExacto(pedido.campo, ctx.campos) : null
  if (pedido.campo && !campo) return avisar('¿En qué campo está el potrero de destino?')
  const destino = resolverReferenciaPotrero(pedido.potrero, ctx.campos, campo?.id ?? observacion.campoId)
  if (!('ok' in destino) || (campo && destino.ok.campo.id !== campo.id)) {
    return avisar(`¿Me decís cómo figura «${pedido.potrero}» y en qué campo? Dejé el borrador pendiente.`)
  }
  const { potrero, campo: campoDestino } = destino.ok
  if (observacion.potreroId === potrero.id) {
    await io.responder({ texto: `El dato de ${titulo} ya figura en el ${potrero.nombre}.` })
    return turno
  }
  const borrador = pendiente.borrador
  const observaciones = [...borrador.observaciones!]
  const existente = observaciones.findIndex(o => o.potreroId === potrero.id)
  if (existente >= 0 && observaciones[existente][aspecto] != null && observaciones[existente][aspecto] !== observacion[aspecto]) {
    return avisar(`El ${potrero.nombre} ya tiene otro dato de ${titulo}. ¿Qué dato querés conservar ahí?`)
  }
  const resto = { ...observacion, [aspecto]: null }
  observaciones[indice] = resto
  const movida: ObsBorrador = {
    agua: null, pasto: null, electrico: null, conteo: null, novedad: null,
    potreroId: potrero.id, campoId: campoDestino.id, [aspecto]: observacion[aspecto],
  }
  if (existente >= 0) observaciones[existente] = { ...observaciones[existente], [aspecto]: observacion[aspecto] }
  else observaciones.push(movida)

  const resultado = await preparar(ctx, { capturaId: pendiente.capturaId, borrador: {
    ...borrador, observaciones: observaciones.filter((o, i) => i !== indice || detalleObs(o)),
  } }, io)
  if (!('paso' in resultado)) return avisar(resultado.aviso)
  const nuevo = { ...turno, pasos: [resultado.paso, ...turno.pasos.filter((_, i) => i !== paso)] }
  if (!await reemplazar(v, turno, nuevo, io, [{ id: pendiente.capturaId, cambio: resultado.cambio }])) return null
  const origen = potreroPorId(ctx.campos, observacion.potreroId)
  const cambio = `Pasé lo de ${titulo} ${origen ? 'del ' + origen.potrero.nombre + ' ' : ''}al ${potrero.nombre} de ${campoDestino.nombre} en el borrador.`
  await mostrar(nuevo, [cambio], io)
  return nuevo
}

const PEDIR_CAMBIO = { texto: 'Decime qué querés cambiar en este pendiente.' }

export async function continuarTurno(
  v: db.Vinculo, ctx: Contexto, turno: PendienteTurno, entrada: { texto: string; botonId?: string; porAudio: boolean }, io: IOCompuesto,
): Promise<boolean> {
  const actual = turno.pasos[0]
  if (!actual) return false
  const comando = norm(entrada.texto).replace(/^[¿¡]+|[.!?]+$/g, '').trim()
  if (!entrada.botonId) {
    const cambio = reubicacionDirecta(comando)
    if (cambio) {
      await reubicarObservacion(v, ctx, turno, cambio, io)
      return true
    }
  }
  const seccion = seccionDe(actual.pendiente.borrador.tipo)
  if (!entrada.botonId && comando === 'ver pendientes') {
    if (seccion && !puedeMandar(ctx.permisos, seccion)) {
      await io.responder({ texto: accesoDenegado(seccion, 'cargar') })
      return true
    }
    await mostrar(turno, [], io)
    return true
  }
  if (!entrada.botonId && comando === 'siguiente pendiente') {
    const nuevo = { ...turno, pasos: [...turno.pasos.slice(1), actual] }
    if (await reemplazar(v, turno, nuevo, io)) await mostrar(nuevo, [], io)
    return true
  }

  const l = leer(entrada, actual.pendiente, ctx)
  if (l.k === 'nuevo' || l.k === 'ayuda') return false
  if (l.k === 'viejo') {
    const guardada = await db.verificarCargaDeCaptura(v, l.capturaId).catch(() => null)
    await mostrar(turno, [guardada ? 'Esa carga ya está guardada.' : 'Ese botón no es del pendiente que está abierto.'], io)
    return true
  }
  if (l.k === 'confirmar') {
    // Una respuesta corta repetida no debe confirmar la siguiente tarjeta.
    if (!entrada.botonId) {
      await mostrar(turno, ['Tocá el botón Guardar de la propuesta que querés confirmar.'], io)
      return true
    }
    const nuevo = restantes(turno)
    const resultado = await io.confirmar(l.capturaId, l.borrador, actual.pendiente, turno, nuevo)
    if (resultado === 'no_guardada') {
      await actualizarPasoTurno(v, ctx, turno, l, io, nuevo)
    } else if (resultado) {
      await mostrar(nuevo, avisoAnterior(turno), io)
    }
    return true
  }
  if (l.k === 'cancelar') {
    const nuevo = restantes(turno)
    const cambio = { estado: 'descartada', notas: ['Cancelada por el productor.'] }
    if (await reemplazar(v, turno, nuevo, io, [{ id: l.capturaId, cambio }])) {
      await mostrar(nuevo, ['Cancelé ese pendiente.', ...avisoAnterior(turno)], io)
    }
    return true
  }
  if (seccion && !puedeMandar(ctx.permisos, seccion)) {
    await io.responder({ texto: accesoDenegado(seccion, 'cargar') })
    return true
  }
  if (l.k === 'seguir') {
    if (!entrada.botonId && actual.pendiente.tipo === 'dato'
      && !/^(?:(?:son|fueron|eran|llovieron|pague) )?\$?\s*-?\d[\d.,]*(?:\s*(?:mm|pesos|mil|k|lucas))?[.!?]*$/.test(comando)) return false
    await actualizarPasoTurno(v, ctx, turno, l, io)
    return true
  }

  const enCorreccion: PasoTurno = {
    pendiente: { tipo: 'corregir', capturaId: l.capturaId, borrador: l.borrador },
    mensaje: PEDIR_CAMBIO,
  }
  const nuevo = { ...turno, pasos: [enCorreccion, ...turno.pasos.slice(1)] }
  if (!await reemplazar(v, turno, nuevo, io)) return true
  if (l.k === 'pedir_correccion') {
    await mostrar(nuevo, [], io)
    return true
  }
  const b = l.borrador
  if (b.tipo === 'recorrida' && /^(?:(?:fue|era) )?(?:hoy|ayer|anteayer|\d{4}-\d{2}-\d{2})$/.test(comando)) {
    await actualizarPasoTurno(v, ctx, nuevo, { capturaId: l.capturaId, borrador: corregir(b, limpiarInterpretacion({ intent: 'novedad' }), ctx, l.texto) }, io)
    return true
  }
  const { interpretacion } = await interpretar(l.texto, ctx, b.tipo === 'recorrida' ? undefined : b)
  if (interpretacion.intent === 'reubicar_observacion') {
    await reubicarObservacion(v, ctx, nuevo, {
      aspecto: interpretacion.aspectoObservacion, potrero: interpretacion.potrero, campo: interpretacion.campo,
    }, io)
    return true
  }
  if (esCharla(interpretacion.intent)) {
    await io.responder({ texto: await io.conversar(l.texto, interpretacion.intent) })
    return true
  }
  if (interpretacion.intent.startsWith('consulta_')) {
    const a = arrancar(interpretacion, ctx, l.texto)
    if (!('respuesta' in a) && (!entrada.porAudio || interpretacion.intent !== 'consulta_hacienda' || nombraHacienda(l.texto))) {
      const paso = siguientePaso(l.capturaId, a.borrador, ctx)
      if (paso.k === 'consultar') {
        await mostrar(nuevo, [await io.consultar(paso.borrador)], io)
        return true
      }
    }
    await mostrar(nuevo, ['Decime de nuevo la consulta con el campo o potrero.'], io)
    return true
  }
  if (b.tipo === 'recorrida') {
    const a = arrancar(interpretacion, ctx, l.texto, { campoHoy: b.campoId })
    if (!('respuesta' in a) && a.borrador.tipo === 'recorrida') {
      await actualizarPasoTurno(v, ctx, nuevo, { capturaId: l.capturaId, borrador: a.borrador }, io)
      return true
    }
  } else if (interpretacion.intent === b.tipo) {
    await actualizarPasoTurno(v, ctx, nuevo, { capturaId: l.capturaId, borrador: corregir(b, interpretacion, ctx, l.texto) }, io)
    return true
  }
  await mostrar(nuevo, [], io)
  return true
}
