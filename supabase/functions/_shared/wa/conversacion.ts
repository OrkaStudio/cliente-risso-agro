// El núcleo del bot: qué hacer con lo que llega, dado lo que el bot preguntó.
//
// Módulo puro: recibe el pendiente guardado y el contexto de la empresa, y
// devuelve la decisión. La Edge Function hace el IO (Meta, modelo, base).
// Reglas de la spec: nada se escribe sin confirmar; los nombres los resuelve
// el código; si hay más de un candidato se pregunta.

import { resolverCampo, resolverCategoria, resolverPotrero, campoPorId, potreroPorId, type PotreroDe } from './resolver.ts'
import { cuandoTexto, mmTexto, norm, numeroEn, pesos } from './texto.ts'
import type { Borrador, Boton, Campo, Contexto, Interpretacion, Mensaje, Pendiente } from './tipos.ts'

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
  'Por ahora puedo anotar *lluvias* y *gastos* (mandame la foto del ticket), y contestarte *cuánta hacienda hay*, *cuánto llovió*, *qué vence* y *hace cuánto están los animales en un potrero*.'

export function ayuda(nombre: string | null): string {
  return `Hola${nombre ? ` ${nombre}` : ''}. ${QUE_PUEDO}\n\nEscribime o mandame un audio, como me lo dirías a mí.`
}

export const NO_SE = `Eso todavía no lo sé. Quedó anotado para sumarlo.\n\n${QUE_PUEDO}`

export const NO_SOPORTADO =
  'Eso todavía no lo cargo por acá. Muertes, nacimientos y movimientos de hacienda van por la app por ahora. Quedó anotado que lo pediste.'

export const NOVEDAD_PRONTO =
  'Las novedades de potrero todavía no las anoto por acá: las estamos por sumar. Por ahora anotala en la recorrida de la app.'

export const AUDIO_PRONTO = 'Todavía no escucho audios. ¿Me lo escribís?'

// ─── De la interpretación al borrador ───────────────────────────────────────

export type Arranque = { borrador: Borrador } | { respuesta: string; estado: 'respondida' | 'descartada' }

export function arrancar(it: Interpretacion, ctx: Contexto): Arranque {
  switch (it.intent) {
    case 'lluvia':
      return { borrador: { tipo: 'lluvia', campoMencion: it.campo, mm: it.mm, fecha: it.fecha } }
    case 'gasto':
      return {
        borrador: {
          tipo: 'gasto',
          campoMencion: it.campo,
          monto: it.monto,
          fecha: it.fecha,
          categoriaId: resolverCategoria(it.categoria, ctx.categoriasGasto)?.id ?? null,
          contraparte: it.contraparte,
          descripcion: it.descripcion,
        },
      }
    case 'consulta_hacienda':
    case 'consulta_lluvia':
    case 'consulta_vencimientos':
    case 'consulta_dias_potrero':
      return { borrador: { tipo: it.intent, campoMencion: it.campo, potreroMencion: it.potrero, periodo: it.periodo } }
    case 'novedad':
      return { respuesta: NOVEDAD_PRONTO, estado: 'descartada' }
    case 'no_soportado':
      return { respuesta: NO_SOPORTADO, estado: 'descartada' }
    case 'saludo':
      return { respuesta: ayuda(ctx.nombre), estado: 'respondida' }
    default:
      return { respuesta: NO_SE, estado: 'descartada' }
  }
}

/** Una corrección pisa sólo lo que el productor cambió. */
export function corregir(b: Borrador, it: Interpretacion, ctx: Contexto): Borrador {
  const n: Borrador = { ...b }
  if (it.campo) Object.assign(n, { campoMencion: it.campo, campoId: null })
  if (it.potrero) Object.assign(n, { potreroMencion: it.potrero, potreroId: null })
  if (it.mm !== null && b.tipo === 'lluvia') n.mm = it.mm
  if (it.monto !== null && b.tipo === 'gasto') n.monto = it.monto
  if (it.fecha) n.fecha = it.fecha
  if (it.contraparte) n.contraparte = it.contraparte
  if (it.descripcion && b.tipo === 'gasto') n.descripcion = it.descripcion
  const cat = resolverCategoria(it.categoria, ctx.categoriasGasto)
  if (cat) n.categoriaId = cat.id
  return n
}

// ─── Leer lo que llega ──────────────────────────────────────────────────────

export type Lectura =
  | { k: 'confirmar'; capturaId: string; borrador: Borrador }
  | { k: 'cancelar'; capturaId: string }
  | { k: 'pedir_correccion'; capturaId: string; borrador: Borrador }
  | { k: 'seguir'; capturaId: string; borrador: Borrador }
  | { k: 'reinterpretar'; capturaId: string; borrador: Borrador; texto: string }
  | { k: 'viejo'; capturaId: string }
  /** Mensaje nuevo. Si había algo pendiente, queda incompleto. */
  | { k: 'nuevo'; abandona: string | null }

const SI = /^(si|sii+|dale|ok|okey|oka|confirmo|de una|correcto|joya|perfecto|listo|asi es|eso)\b/
const NO = /^(no|nop|cancela|cancelar|deja|dejalo|olvidate)\b/

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
    if (accion === 'c' && valor && campoPorId(ctx.campos, valor))
      return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, campoId: valor, campoMencion: null } }
    if (accion === 'p' && valor) {
      const x = potreroPorId(ctx.campos, valor)
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
      if ('ok' in r) return { k: 'seguir', capturaId: p.capturaId, borrador: { ...p.borrador, campoId: r.ok.id, campoMencion: null } }
      if (NO.test(t) && t.length <= 12) return { k: 'cancelar', capturaId: p.capturaId }
      return { k: 'nuevo', abandona: p.capturaId }
    }
    case 'potrero': {
      const r = resolverPotrero(texto, ctx.campos, p.borrador.campoId)
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
  return { texto, lista: { boton, filas: ids.slice(0, 10).map((i) => ({ ...i, titulo: corto(i.titulo, 24) })) } }
}

function preguntarCampo(capturaId: string, b: Borrador, campos: Campo[], texto: string, notas: string[]): Paso {
  if (campos.length > 10) {
    return {
      k: 'preguntar',
      mensaje: { texto: `${texto} Escribime el nombre.` },
      pendiente: { tipo: 'campo', capturaId, borrador: b },
      notas,
    }
  }
  return {
    k: 'preguntar',
    mensaje: opciones(capturaId, campos.map((c) => ({ id: `c=${c.id}`, titulo: c.nombre })), texto, 'Elegir campo'),
    pendiente: { tipo: 'campo', capturaId, borrador: b },
    notas,
  }
}

function preguntarPotrero(capturaId: string, b: Borrador, candidatos: PotreroDe[], texto: string, notas: string[]): Paso {
  const pendiente: Pendiente = { tipo: 'potrero', capturaId, borrador: b }
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
  const cuando = cuandoTexto(b.fecha ?? ctx.hoy, ctx.hoy)
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

export function siguientePaso(capturaId: string, b0: Borrador, ctx: Contexto): Paso {
  const b: Borrador = { ...b0 }
  const notas: string[] = []

  // 1. Resolver lo que nombró.
  if (b.campoMencion && !b.campoId) {
    const r = resolverCampo(b.campoMencion, ctx.campos)
    if ('ok' in r) {
      b.campoId = r.ok.id
      b.campoMencion = null
    } else if ('varios' in r) {
      notas.push(`"${b.campoMencion}" coincide con ${r.varios.length} campos: se pregunta.`)
      b.campoMencion = null
      return preguntarCampo(capturaId, b, r.varios, '¿Cuál de estos campos?', notas)
    } else {
      notas.push(`No hay un campo "${b.campoMencion}".`)
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
            : '¿De qué campo es el gasto?'
        return preguntarCampo(capturaId, b, ctx.campos, texto, notas)
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
          '¿En qué categoría lo anoto?',
          'Elegir categoría',
        ),
        pendiente: { tipo: 'categoria', capturaId, borrador: b },
        notas,
      }
    }
    b.fecha = b.fecha && b.fecha <= ctx.hoy ? b.fecha : ctx.hoy
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

  if (b.tipo === 'consulta_dias_potrero' && !b.potreroId) {
    if (!b.campoId) {
      if (unico) b.campoId = unico.id
      else return preguntarCampo(capturaId, b, ctx.campos, '¿De qué campo?', notas)
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
