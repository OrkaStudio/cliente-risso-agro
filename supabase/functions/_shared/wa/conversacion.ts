// El núcleo del bot: qué hacer con lo que llega, dado lo que el bot preguntó.
//
// Módulo puro: recibe el pendiente guardado y el contexto de la empresa, y
// devuelve la decisión. La Edge Function hace el IO (Meta, modelo, base).
// Reglas de la spec: nada se escribe sin confirmar; los nombres los resuelve
// el código; si hay más de un candidato se pregunta.

import { campoEnTexto, campoExacto, resolverCampo, resolverCategoria, resolverPotrero, campoPorId, potreroPorId, type PotreroDe } from './resolver.ts'
import { cuandoTexto, esFecha, mmTexto, norm, numeroEn, pesos, sumarDias } from './texto.ts'
import type { Borrador, Boton, Campo, Contexto, Interpretacion, Mensaje, ObsBorrador, ObsInterpretada, Pendiente, Ubicado } from './tipos.ts'

// ─── Botones ────────────────────────────────────────────────────────────────
// El id lleva la captura: un botón de una propuesta vieja no confirma la nueva.

export function botonId(capturaId: string, accion: string): string {
  return `${capturaId}|${accion}`
}

export function leerBoton(id: string): { capturaId: string; accion: string } | null {
  const i = id.indexOf('|')
  if (i <= 0) return null
  return { capturaId: id.slice(0, i), accion: id.slice(i + 1) }
}

// ─── Textos fijos ───────────────────────────────────────────────────────────

export const QUE_PUEDO =
  'Puedo anotar *lluvias* y *gastos*, y consultar *hacienda*, *lluvia medida*, *vencimientos* y *días en un potrero*. Para cargar movimientos de hacienda, usá la app.'

export function ayuda(nombre: string | null, opciones: { semanalHabilitado?: boolean; pilotoHabilitado?: boolean } = {}): string {
  return `Hola${nombre ? `, ${nombre}` : ''}. Mandame un audio con la recorrida, lluvia o un gasto; también puedo leer la foto de un ticket. Para ver los potreros, escribí «mapa» o «acercá» y el nombre del potrero. Podés consultar lo registrado y tus últimas cargas.${opciones.semanalHabilitado ? ' Para el documento de la semana, pedime «resumen semanal».' : ''}${opciones.pilotoHabilitado ? ' También: «empezar recorrida», «tareas», «problemas», «comparar recorridas» y «corregir última carga».' : ''}`
}

/** Pedir orientación nunca descarta una propuesta ni reinicia la conversación. */
export function ayudaConPendiente(p: Pendiente | null, ctx: Contexto): string {
  const base = ayuda(ctx.nombre, ctx) + ' Para hablar con el equipo, escribí «soporte».'
  if (!p || p.tipo === 'ubicado') return base
  const asunto = p.borrador.tipo === 'recorrida' ? 'la recorrida' : p.borrador.tipo === 'lluvia' ? 'la lluvia' : p.borrador.tipo === 'gasto' ? 'el gasto' : 'la consulta'
  return `${base}\n\nSigue pendiente ${asunto}. Podés responder la pregunta anterior o escribir «cancelar».`
}

export const NO_SE = 'No pude resolver eso desde acá. Probá con una consulta de lluvia, hacienda o vencimientos, o decime qué lluvia o gasto querés anotar.'

export const NO_SOPORTADO =
  'Por WhatsApp no puedo cargar muertes, nacimientos ni movimientos de hacienda. Cargalos desde Hacienda en la app.'

export const NOVEDAD_SIN_DATOS =
  'Contame qué viste y en qué potrero. Por ejemplo: «en el 5 el molino no anda» o «acá hay poca agua».'

export const NOVEDAD_PRONTO =
  'Por WhatsApp todavía no puedo registrar esa novedad. Cargala desde Recorridas en la app; así queda asociada al potrero.'

export const AUDIO_PRONTO = 'No puedo procesar el audio ahora. ¿Me lo escribís? No se cargó nada.'

/** Los ejemplos usan los campos de la empresa: "en Toimil" no le dice nada a otro productor. */
function camposEjemplo(ctx: Contexto): [string, string] {
  const n = ctx.campos.map((c) => c.nombre)
  return [n[0] ?? 'el campo', n[1] ?? n[0] ?? 'el campo']
}

export function ayudaGasto(ctx: Contexto): string {
  const [a, b] = camposEjemplo(ctx)
  return (
    `Para anotar un gasto, mandame una *foto del ticket o la factura*. Si querés, en el mismo mensaje poné de qué campo es (por ejemplo: "gasoil, ${a}"). ` +
    'Leo el monto, la fecha y a quién le pagaste, y te lo muestro para que confirmes antes de anotarlo.\n\n' +
    `Si no tenés el ticket, escribime o mandame un audio: "pagué 80 mil de gasoil en ${b}".`
  )
}

export function ayudaLluvia(ctx: Contexto): string {
  const [a, b] = camposEjemplo(ctx)
  return (
    `Para anotar lluvia, decime cuánto y en qué campo, escrito o en audio: "llovieron 20 mm en ${a}". ` +
    `Si fue otro día, decímelo: "ayer 15 en ${b}". Te lo muestro para que confirmes antes de anotarlo.`
  )
}

// ─── De la interpretación al borrador ───────────────────────────────────────

export type Arranque = { borrador: Borrador } | { respuesta: string; estado: 'respondida' | 'descartada' }

/**
 * "45 mil de gasoil para Don Gilberto": el modelo puede leer el campo como a
 * quién se le pagó. Si la contraparte es el nombre exacto de un campo y no se
 * nombró otro, es el campo. Un nombre parecido no alcanza: puede ser una persona.
 */
function campoNoContraparte(it: Interpretacion, ctx: Contexto): Interpretacion {
  const campo = campoExacto(it.contraparte, ctx.campos)
  if (!campo) return it
  const nombrado = it.campo ? resolverCampo(it.campo, ctx.campos) : null
  if (nombrado && !('ok' in nombrado && nombrado.ok.id === campo.id)) return it
  return { ...it, campo: it.campo ?? it.contraparte, contraparte: null }
}

/** Lo que el modelo dejó sin campo, si el mensaje nombra uno solo de la empresa. */
function campoDelMensaje(it0: Interpretacion, ctx: Contexto, texto?: string): Interpretacion {
  const it = campoNoContraparte(it0, ctx)
  if (it.campo || !texto) return it
  const campo = campoEnTexto(texto, ctx.campos)
  return campo ? { ...it, campo: campo.nombre } : it
}

/** Sin fecha dicha, el registro es del día en que llegó el mensaje, no del día en que se procesó.
 * El borrador no la fija al arrancar: una recorrida por partes abierta decide la suya. */
const fechaBase = (ctx: Contexto): string => ctx.fechaMensaje ?? ctx.hoy

/** Las fechas explícitas del productor prevalecen sobre las omisiones del modelo. */
function fechaDelMensaje(it: Interpretacion, ctx: Contexto, texto?: string, tipo: string = it.intent): Interpretacion {
  if (!texto || !['lluvia', 'gasto', 'novedad', 'recorrida'].includes(tipo)) return it
  const t = norm(texto)
  const relativos: Record<string, number> = { 'pasado manana': 2, manana: 1, hoy: 0, ayer: -1, anteayer: -2 }
  const fechas = [...t.matchAll(/\b(pasado manana|manana|anteayer|ayer|hoy)\b/g)].map((m) => sumarDias(fechaBase(ctx), relativos[m[1]]))
  fechas.push(...[...t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]))
  const distintas = [...new Set(fechas)]
  if (!distintas.length) return it
  if (distintas.length !== 1 || !esFecha(distintas[0])) return { ...it, fechaInvalida: true }
  return { ...it, fecha: distintas[0], fechaInvalida: false }
}

/** Lo que el bot ya sabe de la recorrida: dónde dijo la ubicación que está, y el campo que recorre hoy. */
export type Recorriendo = { ubicado?: Ubicado | null; campoHoy?: string | null }

function obsDesde(o: ObsInterpretada, it: Interpretacion, r: Recorriendo): ObsBorrador {
  // Sin potrero nombrado ("acá", o no lo dijo): sale de la ubicación.
  const aca = !o.potrero
  const u = aca ? r.ubicado ?? null : null
  return {
    potreroId: u?.potreroId ?? null,
    campoId: u?.campoId ?? null,
    potreroMencion: o.potrero,
    campoMencion: o.campo ?? it.campo,
    aca: aca && !u,
    agua: o.agua,
    pasto: o.pasto,
    electrico: o.electrico,
    conteo: o.conteo,
    novedad: o.novedad,
  }
}

export function arrancar(it0: Interpretacion, ctx: Contexto, texto?: string, r: Recorriendo = {}): Arranque {
  const it = fechaDelMensaje(campoDelMensaje(it0, ctx, texto), ctx, texto)
  if (it.otrosRegistros?.length) return { respuesta: 'Escuché más de un tipo de carga. Mandame la lluvia, el gasto y la recorrida en mensajes separados para no dejar nada afuera. No guardé este mensaje; tu pendiente anterior se conserva.', estado: 'respondida' }
  if (['otro', 'no_soportado'].includes(it.intent) && texto) {
    const mencionado = norm(texto).match(/^en (?:el )?(?:potrero )?(\d+[a-z]?)\b/)
    if (mencionado && 'ninguno' in resolverPotrero(mencionado[1], ctx.campos, null))
      return { respuesta: `No encontré el potrero «${mencionado[1]}». Decime el nombre como figura en la app.`, estado: 'descartada' }
  }
  switch (it.intent) {
    case 'lluvia':
      return { borrador: { tipo: 'lluvia', campoMencion: it.campo, mm: it.mm, fecha: it.fecha, fechaInvalida: it.fechaInvalida } }
    case 'gasto':
      return {
        borrador: {
          tipo: 'gasto',
          campoMencion: it.campo,
          monto: it.monto,
          fecha: it.fecha,
          fechaInvalida: it.fechaInvalida,
          categoriaId: resolverCategoria(it.categoria, ctx.categoriasGasto)?.id ?? null,
          contraparte: it.contraparte,
          descripcion: it.descripcion,
        },
      }
    case 'consulta_hacienda':
    case 'consulta_lluvia':
    case 'consulta_vencimientos':
    case 'consulta_dias_potrero':
    case 'consulta_recorrida':
    case 'consulta_observacion':
    case 'consulta_novedades':
    case 'consulta_cargas':
      return { borrador: { tipo: it.intent, campoMencion: it.campo, potreroMencion: it.potrero, periodo: it.periodo } }
    case 'consulta_gastos':
      return { borrador: { tipo: it.intent, campoMencion: it.campo, categoriaMencion: it.categoria, periodo: it.periodo } }
    case 'novedad':
      if (!it.observaciones.length) return { respuesta: NOVEDAD_SIN_DATOS, estado: 'respondida' }
      return {
        borrador: {
          tipo: 'recorrida',
          fecha: it.fecha,
          fechaInvalida: it.fechaInvalida,
          campoId: r.ubicado?.campoId ?? r.campoHoy ?? null,
          observaciones: it.observaciones.map((o) => obsDesde(o, it, r)),
        },
      }
    case 'no_soportado':
      return { respuesta: NO_SOPORTADO, estado: 'descartada' }
    case 'ayuda_gasto':
      return { respuesta: ayudaGasto(ctx), estado: 'respondida' }
    case 'ayuda_lluvia':
      return { respuesta: ayudaLluvia(ctx), estado: 'respondida' }
    case 'saludo':
      return { respuesta: ayuda(ctx.nombre, ctx), estado: 'respondida' }
    default:
      return { respuesta: NO_SE, estado: 'descartada' }
  }
}

/** Una corrección pisa sólo lo que el productor cambió. */
export function corregir(b: Borrador, it0: Interpretacion, ctx: Contexto, texto?: string): Borrador {
  const it = fechaDelMensaje(campoDelMensaje(it0, ctx, texto), ctx, texto, b.tipo)
  const n: Borrador = { ...b }
  if (it.campo) Object.assign(n, { campoMencion: it.campo, campoId: null })
  if (it.potrero) Object.assign(n, { potreroMencion: it.potrero, potreroId: null })
  if (it.mm !== null && b.tipo === 'lluvia') n.mm = it.mm
  if (it.monto !== null && b.tipo === 'gasto') n.monto = it.monto
  if (it.fechaInvalida) n.fechaInvalida = true
  else if (it.fecha) { n.fecha = it.fecha; n.fechaInvalida = false }
  if (it.contraparte) n.contraparte = it.contraparte
  if (it.descripcion && b.tipo === 'gasto') n.descripcion = it.descripcion
  const cat = resolverCategoria(it.categoria, ctx.categoriasGasto)
  if (cat) n.categoriaId = cat.id
  return n
}

// ─── Leer lo que llega ──────────────────────────────────────────────────────

export type Lectura =
  | { k: 'ayuda' }
  | { k: 'confirmar'; capturaId: string; borrador: Borrador }
  | { k: 'cancelar'; capturaId: string }
  | { k: 'pedir_correccion'; capturaId: string; borrador: Borrador }
  | { k: 'seguir'; capturaId: string; borrador: Borrador }
  | { k: 'reinterpretar'; capturaId: string; borrador: Borrador; texto: string }
  | { k: 'viejo'; capturaId: string }
  /** Mensaje nuevo. Si había algo pendiente, queda incompleto. */
  | { k: 'nuevo'; abandona: string | null }

export const SI = /^(si|sii+|dale|ok|okey|oka|confirmo|de una|correcto|joya|perfecto|listo|asi es|eso)\b/
export const NO = /^(no|nop|cancela|cancelar|deja|dejalo|olvidate)\b/

function lluviaLista(b: Borrador, ctx: Contexto): boolean {
  return b.tipo === 'lluvia' && typeof b.mm === 'number' && Number.isFinite(b.mm) && b.mm >= 0 &&
    esFecha(b.fecha) && b.fecha <= ctx.hoy
}

function elegirCampo(p: Exclude<Pendiente, { tipo: 'ubicado' }>, campoId: string, ctx: Contexto): Lectura {
  const borrador = { ...p.borrador, campoId, campoMencion: null }
  const confirma = p.tipo === 'campo' && p.confirmaAlElegir === true &&
    p.camposOfrecidos?.includes(campoId) && campoPorId(ctx.campos, campoId) && lluviaLista(borrador, ctx)
  return { k: confirma ? 'confirmar' : 'seguir', capturaId: p.capturaId, borrador }
}

export function leer(
  entrada: { texto?: string; botonId?: string },
  p: Pendiente | null,
  ctx: Contexto,
): Lectura {
  if (entrada.botonId) {
    const b = leerBoton(entrada.botonId)
    if (!b || !p || p.capturaId !== b.capturaId) return { k: 'viejo', capturaId: b?.capturaId ?? '' }
    const [accion, valor] = b.accion.split('=')
    if (accion === 'si' && p.tipo === 'propuesta') return { k: 'confirmar', capturaId: p.capturaId, borrador: p.borrador }
    if (accion === 'cancelar') return { k: 'cancelar', capturaId: p.capturaId }
    if (accion === 'corregir') return { k: 'pedir_correccion', capturaId: p.capturaId, borrador: p.borrador }
    if (accion === 'cl') {
      if (p.tipo !== 'campo' || !p.confirmaAlElegir || !valor) return { k: 'viejo', capturaId: p.capturaId }
      const partes = valor.split('@')
      // Un selector anterior con otra cantidad o fecha no confirma el borrador actual.
      if (partes.length !== 3 || partes[1] !== p.borrador.fecha || partes[2] !== String(p.borrador.mm))
        return { k: 'viejo', capturaId: p.capturaId }
      const lectura = elegirCampo(p, partes[0], ctx)
      return lectura.k === 'confirmar' ? lectura : { k: 'viejo', capturaId: p.capturaId }
    }
    if (accion === 'c' && valor && campoPorId(ctx.campos, valor))
      return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, campoId: valor, campoMencion: null } }
    if (accion === 'p' && valor) {
      const x = potreroPorId(ctx.campos, valor)
      if (x && p.tipo === 'potrero' && p.obsIndex !== undefined)
        return { k: 'seguir', capturaId: p.capturaId, borrador: ponerPotrero(p.borrador, p.obsIndex, x) }
      if (x)
        return {
          k: 'seguir',
          capturaId: p.capturaId,
          borrador: { ...p.borrador, potreroId: x.potrero.id, campoId: x.campo.id, potreroMencion: null, campoMencion: null },
        }
    }
    if (accion === 'k' && valor && ctx.categoriasGasto.some((c) => c.id === valor))
      return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, categoriaId: valor } }
    return { k: 'viejo', capturaId: p.capturaId }
  }

  const texto = (entrada.texto ?? '').trim()
  if (/^(hola|buenas|ayuda|que (podes|puedes) hacer)[?!.\s]*$/.test(norm(texto).replace(/^[¿¡]+/, '')))
    return { k: 'ayuda' }
  if (!p) return { k: 'nuevo', abandona: null }
  const t = norm(texto)

  switch (p.tipo) {
    case 'propuesta': {
      if (SI.test(t)) return { k: 'confirmar', capturaId: p.capturaId, borrador: p.borrador }
      if (NO.test(t)) {
        const resto = t.replace(NO, '').replace(/^[\s,.:;-]+/, '')
        if (!resto) return { k: 'cancelar', capturaId: p.capturaId }
        return { k: 'reinterpretar', capturaId: p.capturaId, borrador: p.borrador, texto }
      }
      if (/^(eran|era|fueron|fue|en |del |de )/.test(t))
        return { k: 'reinterpretar', capturaId: p.capturaId, borrador: p.borrador, texto }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'corregir':
      return { k: 'reinterpretar', capturaId: p.capturaId, borrador: p.borrador, texto }
    case 'dato': {
      const n = numeroEn(texto)
      if (n !== null && texto.length <= 40) return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, [p.dato]: n } }
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'campo': {
      const r = resolverCampo(texto, ctx.campos)
      if ('ok' in r) return elegirCampo(p, r.ok.id, ctx)
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'potrero': {
      const r = resolverPotrero(texto, ctx.campos, p.borrador.campoId)
      if ('ok' in r && p.obsIndex !== undefined)
        return { k: 'seguir', capturaId: p.capturaId, borrador: ponerPotrero(p.borrador, p.obsIndex, r.ok) }
      if ('ok' in r)
        return {
          k: 'seguir',
          capturaId: p.capturaId,
          borrador: { ...p.borrador, potreroId: r.ok.potrero.id, campoId: r.ok.campo.id, potreroMencion: null },
        }
      if ('varios' in r) return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, potreroMencion: texto } }
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'ubicacion': {
      // Contestó con el nombre en vez de la ubicación: "el 5", "5B".
      const r = resolverPotrero(texto, ctx.campos, p.borrador.campoId)
      if ('ok' in r || 'varios' in r) {
        const target = p.obsIndex ?? (p.borrador.observaciones ?? []).findIndex(o => o.aca && !o.potreroId)
        const observaciones = (p.borrador.observaciones ?? []).map((o, i) =>
          i === target && !o.potreroId ? { ...o, potreroMencion: texto, aca: false } : o)
        return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, observaciones } }
      }
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'ubicado':
      return { k: 'nuevo', abandona: null }
    case 'categoria': {
      const c = resolverCategoria(texto, ctx.categoriasGasto)
      if (c) return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, categoriaId: c.id } }
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
  }
}

// ─── El siguiente paso ──────────────────────────────────────────────────────

export type Paso =
  | { k: 'preguntar'; mensaje: Mensaje; pendiente: Pendiente; notas: string[] }
  | { k: 'proponer'; mensaje: Mensaje; pendiente: Pendiente; borrador: Borrador; notas: string[] }
  | { k: 'consultar'; borrador: Borrador; notas: string[] }
  | { k: 'decir'; mensaje: Mensaje; notas: string[] }

const corto = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

function opciones(capturaId: string, items: Boton[], texto: string, boton: string): Mensaje {
  const ids = items.map((i) => ({ ...i, id: botonId(capturaId, i.id) }))
  if (ids.length <= 3) return { texto, botones: ids.map((i) => ({ ...i, titulo: corto(i.titulo, 20) })) }
  // WhatsApp muestra hasta 10 filas: si hay más, que se pueda escribir la que falta.
  const resto = ids.length > 10 ? ' Si no está en la lista, escribime el nombre.' : ''
  return { texto: texto + resto, lista: { boton, filas: ids.slice(0, 10).map((i) => ({ ...i, titulo: corto(i.titulo, 24) })) } }
}

function preguntarCampo(
  capturaId: string, b: Borrador, campos: Campo[], texto: string, notas: string[], ctx: Contexto, aviso = '',
): Paso {
  const lluvia = { ...b, fecha: b.fecha ?? fechaBase(ctx) }
  const confirma = lluviaLista(lluvia, ctx)
  const pendiente: Pendiente = confirma
    ? { tipo: 'campo', capturaId, borrador: lluvia, confirmaAlElegir: true, camposOfrecidos: campos.map((c) => c.id) }
    : { tipo: 'campo', capturaId, borrador: b }
  if (confirma) {
    texto = `¿En qué campo registro *${mmTexto(lluvia.mm!)} mm*, ${cuandoTexto(lluvia.fecha, ctx.hoy)}? ` +
      `${campos.length > 10 ? 'Al escribir el campo' : 'Al elegirlo'} queda guardado.`
  }
  texto = aviso + texto
  if (campos.length > 10) {
    return {
      k: 'preguntar',
      mensaje: { texto: `${texto} Escribime el nombre.` },
      pendiente,
      notas,
    }
  }
  return {
    k: 'preguntar',
    mensaje: opciones(capturaId, campos.map((c) => ({
      id: confirma ? `cl=${c.id}@${lluvia.fecha}@${lluvia.mm}` : `c=${c.id}`, titulo: c.nombre,
    })), texto, 'Elegir campo'),
    pendiente,
    notas,
  }
}

function preguntarPotrero(
  capturaId: string, b: Borrador, candidatos: PotreroDe[], texto: string, notas: string[], obsIndex?: number,
): Paso {
  const pendiente: Pendiente = { tipo: 'potrero', capturaId, borrador: b, ...(obsIndex === undefined ? {} : { obsIndex }) }
  if (candidatos.length > 10) {
    const nombres = candidatos.map((x) => x.potrero.nombre)
    return {
      k: 'preguntar',
      mensaje: { texto: `${texto} Escribime cuál (por ejemplo ${nombres[0]}).` },
      pendiente,
      notas,
    }
  }
  const varios = new Set(candidatos.map((x) => x.campo.id)).size > 1
  return {
    k: 'preguntar',
    mensaje: opciones(
      capturaId,
      candidatos.map((x) => ({
        id: `p=${x.potrero.id}`,
        titulo: varios ? `${x.potrero.nombre} · ${x.campo.nombre}` : `Potrero ${x.potrero.nombre}`,
      })),
      texto,
      'Elegir potrero',
    ),
    pendiente,
    notas,
  }
}

export function textoPropuesta(b: Borrador, ctx: Contexto): string {
  const campo = campoPorId(ctx.campos, b.campoId)?.nombre ?? ''
  const cuando = cuandoTexto(b.fecha ?? fechaBase(ctx), ctx.hoy)
  if (b.tipo === 'lluvia') return `Anoto *${mmTexto(b.mm ?? 0)} mm en ${campo}*, ${cuando}.`
  const cat = ctx.categoriasGasto.find((c) => c.id === b.categoriaId)?.nombre ?? ''
  const partes = [
    `Anoto un *gasto de ${pesos(b.monto ?? 0)}*${b.contraparte ? ` a ${b.contraparte}` : ''}`,
    `${cat} · ${campo} · pagado ${cuando}`,
  ]
  if (b.descripcion) partes.push(b.descripcion)
  const iva = (b.ivaLineas ?? []).reduce((s, l) => s + (l.iva || 0), 0)
  if (iva > 0) partes.push(`IVA ${pesos(iva)}`)
  if (b.fotoMediaId) partes.push('Guardo la foto del comprobante.')
  return partes.join('\n')
}

// ─── Recorrida ──────────────────────────────────────────────────────────────

/** "aguada baja, pasto escaso, 80 cabezas, faltan 2 terneros" */
export function detalleObs(o: ObsBorrador): string {
  const partes: string[] = []
  if (o.agua) partes.push(`aguada ${o.agua}`)
  if (o.pasto) partes.push(`pasto ${o.pasto}`)
  if (o.electrico) partes.push(o.electrico === 'cortado' ? 'eléctrico cortado' : 'eléctrico bien')
  if (o.conteo !== null && o.conteo !== undefined) partes.push(`${o.conteo} cabezas`)
  if (o.novedad) partes.push(o.novedad)
  return partes.join(', ')
}

/** El potrero que eligió para una observación; su campo pasa a ser el de la recorrida. */
function ponerPotrero(b: Borrador, i: number, x: PotreroDe): Borrador {
  const observaciones = (b.observaciones ?? []).map((o, j) =>
    j === i ? { ...o, potreroId: x.potrero.id, campoId: x.campo.id, potreroMencion: null, aca: false } : o)
  return { ...b, campoId: b.campoId ?? x.campo.id, observaciones }
}

/** La ubicación compartida va a las observaciones que dijeron "acá". */
export function conUbicacion(b: Borrador, u: Ubicado, obsIndex?: number): Borrador {
  const observaciones = (b.observaciones ?? []).map((o, i) =>
    (obsIndex === undefined || i === obsIndex) && o.aca && !o.potreroId ? { ...o, potreroId: u.potreroId, campoId: u.campoId, aca: false } : o)
  return { ...b, campoId: b.campoId ?? u.campoId, observaciones }
}

const MUERTE = /muert|muri[oó]/i

function textoRecorrida(obs: ObsBorrador[], ctx: Contexto, aviso: string, fecha: string): string {
  const grupos = new Map<string, string[]>()
  for (const o of obs) {
    const x = potreroPorId(ctx.campos, o.potreroId!)
    const campo = x?.campo.nombre ?? ''
    grupos.set(campo, [...(grupos.get(campo) ?? []), `• *${x?.potrero.nombre ?? '?'}*: ${detalleObs(o)}`])
  }
  const cuerpo = [...grupos.entries()].map(([campo, lineas]) => `${campo}\n${lineas.join('\n')}`).join('\n\n')
  const baja = obs.some((o) => o.novedad && MUERTE.test(o.novedad))
    ? '\n\nLa baja del animal no la hago por acá: queda como novedad y la das de baja en Hacienda.'
    : ''
  return `${aviso}Anoto en la recorrida de ${cuandoTexto(fecha, ctx.hoy)}:\n${cuerpo}${baja}`
}

export function preguntaRecorrida(p: Pendiente, ctx: Contexto): string {
  if (p.tipo !== 'ubicacion') return '¿A qué potrero corresponde lo que contaste? Respondé con el nombre, por texto o audio.'
  const obs=p.borrador.observaciones?.[p.obsIndex ?? 0]
  const detalle=obs ? detalleObs(obs) : 'lo que contaste'
  return `¿A qué potrero corresponde «${corto(detalle,220)}»?${p.confirmaAlElegir ? ` Al responder con el nombre, guardo esta observación de ${cuandoTexto(p.borrador.fecha ?? fechaBase(ctx),ctx.hoy)}.` : ' Respondé con el nombre, por texto o audio.'}`
}

/**
 * Cada observación necesita su potrero: por nombre (el campo de la recorrida
 * desempata), por la ubicación si dijo "acá", o preguntando si hay más de uno.
 * Un potrero que no existe no se anota y se avisa.
 */
function pasoRecorrida(capturaId: string, b0: Borrador, ctx: Contexto): Paso {
  const notas: string[] = []
  if (b0.fechaInvalida || (b0.fecha && (!esFecha(b0.fecha) || b0.fecha > ctx.hoy)))
    return { k: 'preguntar', mensaje: { texto: '¿Qué día hiciste la recorrida? Decime hoy o una fecha anterior.' }, pendiente: { tipo: 'corregir', capturaId, borrador: b0 }, notas }
  const noEncontrados: string[] = []
  const quedan: ObsBorrador[] = []
  let ambigua: { i: number; candidatos: PotreroDe[]; mencion: string } | null = null

  for (const o0 of b0.observaciones ?? []) {
    const o = { ...o0 }
    if(o.potreroId){
      const conocido=potreroPorId(ctx.campos,o.potreroId)
      if(!conocido || (o.campoId && o.campoId!==conocido.campo.id)){
        noEncontrados.push(o.potreroMencion ?? 'un potrero no disponible');notas.push('Referencia de potrero/campo no autorizada.');continue
      }
      o.campoId=conocido.campo.id
    }
    if (!o.potreroId && o.potreroMencion) {
      const campoNombrado = o.campoId ?? (o.campoMencion ? campoExacto(o.campoMencion, ctx.campos)?.id ?? null : null)
      let r = resolverPotrero(o.potreroMencion, ctx.campos, campoNombrado ?? b0.campoId)
      if ('ninguno' in r && !campoNombrado && b0.campoId) r = resolverPotrero(o.potreroMencion, ctx.campos, null)
      if ('ok' in r) Object.assign(o, { potreroId: r.ok.potrero.id, campoId: r.ok.campo.id, potreroMencion: null })
      else if ('ninguno' in r) {
        noEncontrados.push(o.potreroMencion)
        notas.push(`No hay un potrero "${o.potreroMencion}".`)
        continue
      } else if (!ambigua) ambigua = { i: quedan.length, candidatos: r.varios, mencion: o.potreroMencion }
    }
    quedan.push(o)
  }

  const b: Borrador = { ...b0, fecha: b0.fecha ?? fechaBase(ctx), observaciones: quedan }
  const aviso = noEncontrados.length
    ? `No encontré ${noEncontrados.length === 1 ? 'el potrero' : 'los potreros'} «${noEncontrados.join('», «')}»: eso no lo anoto. `
    : ''

  if (!quedan.length) {
    return { k: 'decir', mensaje: { texto: `${aviso}Decime el potrero como figura en la app.`.trim() }, notas }
  }
  if (quedan.some((o) => o.aca && !o.potreroId)) {
    const pendiente: Pendiente = { tipo: 'ubicacion', capturaId, borrador: b, obsIndex: quedan.findIndex(o => o.aca && !o.potreroId), confirmaAlElegir: quedan.length === 1 && !b.sesionId }
    return {
      k: 'preguntar',
      mensaje: { texto: `${aviso}${preguntaRecorrida(pendiente,ctx)}`, botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }] },
      pendiente,
      notas,
    }
  }
  if (ambigua) {
    const o = quedan[ambigua.i]
    const campos = [...new Set(ambigua.candidatos.map((x) => x.campo.nombre))]
    const texto = campos.length > 1
      ? `${aviso}Hay un potrero ${ambigua.mencion} en ${campos.join(', ')}. ¿Cuál es el de «${corto(detalleObs(o), 40)}»?`
      : `${aviso}¿Qué potrero ${ambigua.mencion}?`
    return preguntarPotrero(capturaId, b, ambigua.candidatos, texto, notas, ambigua.i)
  }
  return {
    k: 'proponer',
    borrador: b,
    mensaje: {
      texto: textoRecorrida(quedan, ctx, aviso, b.fecha!),
      botones: [
        { id: botonId(capturaId, 'si'), titulo: 'Sí' },
        { id: botonId(capturaId, 'corregir'), titulo: 'Corregir' },
        { id: botonId(capturaId, 'cancelar'), titulo: 'Cancelar' },
      ],
    },
    pendiente: { tipo: 'propuesta', capturaId, borrador: b },
    notas,
  }
}

export function siguientePaso(capturaId: string, b0: Borrador, ctx: Contexto): Paso {
  if (b0.tipo === 'recorrida') return pasoRecorrida(capturaId, b0, ctx)
  const b: Borrador = { ...b0 }
  const notas: string[] = []
  // Si nombró un campo que no existe, la pregunta lo dice: si no, parece que no lo leyó.
  let aviso = ''

  if (b.tipo === 'lluvia' || b.tipo === 'gasto') {
    if (b.fechaInvalida || (b.fecha != null && (!esFecha(b.fecha) || b.fecha > ctx.hoy)))
      return { k: 'preguntar', mensaje: { texto: 'La fecha no es válida para una carga realizada. Decime la fecha correcta (hoy o un día anterior).' }, pendiente: { tipo: 'corregir', capturaId, borrador: b }, notas }
    const valor = b.tipo === 'lluvia' ? b.mm : b.monto
    if (valor != null && (!Number.isFinite(valor) || valor < 0 || (b.tipo === 'gasto' && valor === 0)))
      return { k: 'preguntar', mensaje: { texto: b.tipo === 'gasto' ? 'El monto debe ser mayor que cero. Decime cuánto pagaste.' : 'Los milímetros deben ser un número de cero o más. Decime cuánto llovió.' }, pendiente: { tipo: 'dato', capturaId, borrador: b, dato: b.tipo === 'gasto' ? 'monto' : 'mm' }, notas }
  }

  // 1. Resolver lo que nombró.
  if (b.campoMencion && !b.campoId) {
    const r = resolverCampo(b.campoMencion, ctx.campos)
    if ('ok' in r) {
      b.campoId = r.ok.id
      b.campoMencion = null
    } else if ('varios' in r) {
      notas.push(`"${b.campoMencion}" coincide con ${r.varios.length} campos: se pregunta.`)
      b.campoMencion = null
      return preguntarCampo(capturaId, b, r.varios, '¿Cuál de estos campos?', notas, ctx)
    } else {
      notas.push(`No hay un campo "${b.campoMencion}".`)
      aviso = `No encontré el campo «${b.campoMencion}». `
      if (b.tipo.startsWith('consulta_')) return { k: 'decir', mensaje: { texto: `${aviso}Decime el nombre como figura en la app.` }, notas }
      b.campoMencion = null
    }
  }
  if (b.potreroMencion && !b.potreroId) {
    const r = resolverPotrero(b.potreroMencion, ctx.campos, b.campoId)
    if ('ok' in r) {
      b.potreroId = r.ok.potrero.id
      b.campoId = r.ok.campo.id
      b.potreroMencion = null
    } else if ('varios' in r) {
      const mencion = b.potreroMencion
      b.potreroMencion = null
      const campos = new Set(r.varios.map((x) => x.campo.nombre))
      notas.push(`"${mencion}" existe en ${campos.size} campos: se pregunta, no se adivina.`)
      const texto =
        campos.size > 1
          ? `Hay un potrero ${mencion} en ${[...campos].join(' y en ')}. ¿Cuál es?`
          : `¿Qué potrero ${mencion}?`
      return preguntarPotrero(capturaId, b, r.varios, texto, notas)
    } else {
      notas.push(`No hay un potrero "${b.potreroMencion}".`)
      b.potreroMencion = null
    }
  }

  const unico = ctx.campos.length === 1 ? ctx.campos[0] : null

  // 2. Lo que falta según el tipo.
  if (b.tipo === 'lluvia' || b.tipo === 'gasto') {
    if (!b.campoId) {
      if (!ctx.campos.length)
        return { k: 'decir', mensaje: { texto: 'Primero cargá tu campo en la app y después te lo anoto.' }, notas }
      if (unico) b.campoId = unico.id
      else {
        const texto =
          b.tipo === 'lluvia'
            ? b.mm !== null && b.mm !== undefined
              ? `¿En qué campo llovieron ${mmTexto(b.mm)} mm?`
              : '¿En qué campo llovió?'
            : `¿De qué campo es el gasto${b.monto ? ` de *${pesos(b.monto)}*` : ''}?`
        return preguntarCampo(capturaId, b, ctx.campos, texto, notas, ctx, aviso)
      }
    }
    if (b.tipo === 'lluvia' && (b.mm === null || b.mm === undefined)) {
      const campo = campoPorId(ctx.campos, b.campoId)!.nombre
      return {
        k: 'preguntar',
        mensaje: { texto: `¿Cuántos mm marcó el pluviómetro en ${campo}?` },
        pendiente: { tipo: 'dato', capturaId, borrador: b, dato: 'mm' },
        notas,
      }
    }
    if (b.tipo === 'gasto' && (b.monto === null || b.monto === undefined || b.monto <= 0)) {
      return {
        k: 'preguntar',
        mensaje: { texto: '¿De cuánto fue el gasto?' },
        pendiente: { tipo: 'dato', capturaId, borrador: b, dato: 'monto' },
        notas,
      }
    }
    if (b.tipo === 'gasto' && !b.categoriaId) {
      return {
        k: 'preguntar',
        mensaje: opciones(
          capturaId,
          ctx.categoriasGasto.map((c) => ({ id: `k=${c.id}`, titulo: c.nombre })),
          b.monto ? `¿En qué categoría anoto el gasto de *${pesos(b.monto)}*?` : '¿En qué categoría lo anoto?',
          'Elegir categoría',
        ),
        pendiente: { tipo: 'categoria', capturaId, borrador: b },
        notas,
      }
    }
    b.fecha = b.fecha ?? fechaBase(ctx)
    return {
      k: 'proponer',
      borrador: b,
      mensaje: {
        texto: textoPropuesta(b, ctx),
        botones: [
          { id: botonId(capturaId, 'si'), titulo: 'Sí' },
          { id: botonId(capturaId, 'corregir'), titulo: 'Corregir' },
          { id: botonId(capturaId, 'cancelar'), titulo: 'Cancelar' },
        ],
      },
      pendiente: { tipo: 'propuesta', capturaId, borrador: b },
      notas,
    }
  }

  if (b.tipo === 'consulta_gastos' && b.categoriaMencion) {
    const categoria = resolverCategoria(b.categoriaMencion, ctx.categoriasGasto)
    if (!categoria) return { k: 'decir', mensaje: { texto: `No encontré la categoría «${b.categoriaMencion}». Decime una de las categorías de la app.` }, notas }
    b.categoriaId = categoria.id
  }

  if ((b.tipo === 'consulta_dias_potrero' || b.tipo === 'consulta_observacion') && !b.potreroId) {
    if (!b.campoId) {
      if (unico) b.campoId = unico.id
      else return preguntarCampo(capturaId, b, ctx.campos, '¿De qué campo?', notas, ctx)
    }
    const campo = campoPorId(ctx.campos, b.campoId)!
    return preguntarPotrero(
      capturaId,
      b,
      campo.potreros.map((p) => ({ campo, potrero: p })),
      `¿Qué potrero de ${campo.nombre}?`,
      notas,
    )
  }

  return { k: 'consultar', borrador: b, notas }
}
