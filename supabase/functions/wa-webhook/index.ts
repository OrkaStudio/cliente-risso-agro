// Edge function: wa-webhook
//
// Recibe los mensajes de WhatsApp (Cloud API de Meta), los guarda crudos y
// responde 200 enseguida; el procesamiento sigue en segundo plano. Spec:
// orka-brain/clientes/risso-agro/especificaciones/2026-09-24-whatsapp-captura-fase1.md
//
// Se publica con verify_jwt = false (Meta no manda JWT): la autenticidad la da
// la firma X-Hub-Signature-256 con el secreto de la app.
//
// Secrets: WA_TOKEN, WA_PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN,
// ANTHROPIC_API_KEY (+ los SUPABASE_* que da la plataforma).

import {
  arrancar,
  AUDIO_PRONTO,
  corregir,
  leer,
  QUE_PUEDO,
  siguientePaso,
  type Paso,
} from '../_shared/wa/conversacion.ts'
import { pistaTranscripcion } from '../_shared/wa/interpretar.ts'
import * as R from '../_shared/wa/respuestas.ts'
import { campoPorId, potreroPorId } from '../_shared/wa/resolver.ts'
import { esFecha, hoyAR } from '../_shared/wa/texto.ts'
import type { Borrador, Contexto, Mensaje, Pendiente } from '../_shared/wa/tipos.ts'
import * as db from './db.ts'
import { interpretar, leerComprobante, transcribir } from './llm.ts'
import * as meta from './meta.ts'

const NO_VINCULADO =
  'Hola. Este número no está vinculado a ninguna cuenta. Si usás la app de campo de Orka, pedinos que lo vinculemos.'
const ERROR = 'Tuve un problema y no lo pude anotar. Ya nos llegó el aviso; probá de nuevo en un rato.'
/** Después de esto, lo que el bot preguntó se da por abandonado. */
const PENDIENTE_VENCE_MS = 12 * 60 * 60 * 1000

type MensajeMeta = {
  id: string
  from: string
  type: string
  text?: { body: string }
  interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  button?: { payload: string; text: string }
  image?: { id: string; mime_type: string; caption?: string }
  audio?: { id: string }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Verificación del webhook al configurarlo en Meta.
  if (req.method === 'GET') {
    const ok =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN')
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const crudo = await req.text()
  if (!(await meta.firmaValida(crudo, req.headers.get('x-hub-signature-256')))) {
    console.warn('wa-webhook: firma inválida')
    return new Response('bad signature', { status: 401 })
  }

  let body: { entry?: { changes?: { value?: Record<string, unknown> }[] }[] }
  try {
    body = JSON.parse(crudo)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const trabajos: Promise<unknown>[] = []
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      for (const s of (value.statuses as { id: string; status: string; errors?: unknown }[]) ?? []) {
        trabajos.push(db.actualizarEstado(s.id, s.status, s.errors ?? null).catch((e) => console.error('estado', e)))
      }
      for (const m of (value.messages as MensajeMeta[]) ?? []) {
        trabajos.push(recibir(m).catch((e) => console.error('recibir', e)))
      }
    }
  }
  // Guardar es rápido; lo lento (modelo, respuestas) sigue después del 200.
  await Promise.all(trabajos)
  return new Response('ok')
})

/** Guarda el mensaje (una sola vez por wamid) y deja el procesamiento en segundo plano. */
async function recibir(m: MensajeMeta): Promise<void> {
  const vinculo = await db.vinculoDe(m.from)
  // Un número sin vincular: sólo el registro técnico, no su contenido.
  const cuerpo = vinculo ? m : { type: m.type, sin_vincular: true }
  const mensajeId = await db.guardarEntrante({ wamid: m.id, telefono: m.from, tipo: m.type, cuerpo, vinculo })
  if (!mensajeId) return // Meta lo reenvió: ya se procesó.
  const tarea = procesar(m, mensajeId, vinculo).catch((e) => console.error('procesar', e))
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(tarea)
  else await tarea
}

async function responder(v: db.Vinculo | null, to: string, m: Mensaje): Promise<void> {
  const r = await meta.enviar(to, m)
  await db.guardarSaliente({ wamid: r.wamid, telefono: to, vinculo: v, cuerpo: r.cuerpo })
}

async function procesar(m: MensajeMeta, mensajeId: string, v: db.Vinculo | null): Promise<void> {
  if (!v) {
    await responder(null, m.from, { texto: NO_VINCULADO })
    return
  }
  await meta.leidoYEscribiendo(m.id)
  const hoy = hoyAR()
  const ctx = await db.contexto(v, hoy)

  // Lo que el bot preguntó hace mucho ya no se espera.
  let pendiente: Pendiente | null = v.pendiente
  if (pendiente && v.pendiente_at && Date.now() - new Date(v.pendiente_at).getTime() > PENDIENTE_VENCE_MS) {
    await db.actualizarCaptura(pendiente.capturaId, { estado: 'incompleta', notas: ['Quedó sin respuesta más de 12 horas.'] })
    await db.guardarPendiente(v.id, null)
    pendiente = null
  }

  let capturaId: string | null = null
  try {
    if (m.type === 'image' && m.image) {
      capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada: 'foto', texto: m.image.caption ?? null })
      if (pendiente) await abandonar(pendiente.capturaId)
      await foto(v, ctx, capturaId, m.image)
      return
    }
    const botonId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.button?.payload
    let texto = m.text?.body ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.button?.text ?? ''
    let porAudio = false

    // Nota de voz: se transcribe y sigue el mismo camino que un texto
    // (también sirve para contestar lo que el bot preguntó: "veinticinco").
    if (m.type === 'audio' && m.audio) {
      if (!Deno.env.get('OPENAI_API_KEY')) {
        await responder(v, m.from, { texto: AUDIO_PRONTO })
        return
      }
      const a = await meta.descargarMedia(m.audio.id)
      texto = await transcribir(a.bytes, a.mime, pistaTranscripcion(ctx))
      porAudio = true
      if (!texto) {
        await responder(v, m.from, { texto: 'No te entendí el audio. ¿Me lo repetís o me lo escribís?' })
        return
      }
    }

    if (!botonId && !texto) {
      await responder(v, m.from, { texto: `Eso no lo puedo leer. ${QUE_PUEDO}` })
      return
    }

    const l = leer({ texto, botonId }, pendiente, ctx)
    switch (l.k) {
      case 'viejo': {
        const estado = await db.estadoCaptura(l.capturaId)
        await responder(v, m.from, {
          texto: estado === 'confirmada' ? 'Eso ya estaba anotado. No lo cargo de nuevo.' : 'Eso ya quedó atrás. Mandame de nuevo lo que querías anotar.',
        })
        return
      }
      case 'confirmar':
        capturaId = l.capturaId
        await confirmar(v, ctx, l.capturaId, l.borrador)
        return
      case 'cancelar':
        await db.actualizarCaptura(l.capturaId, { estado: 'descartada', notas: ['Cancelada por el productor.'] })
        await db.guardarPendiente(v.id, null)
        await responder(v, m.from, { texto: 'Listo, no anoto nada.' })
        return
      case 'pedir_correccion':
        await db.guardarPendiente(v.id, { tipo: 'corregir', capturaId: l.capturaId, borrador: l.borrador })
        await responder(v, m.from, { texto: 'Decime qué cambio. Por ejemplo: "eran 25" o "en otro campo".' })
        return
      case 'seguir':
        capturaId = l.capturaId
        await avanzar(v, ctx, l.capturaId, l.borrador, [])
        return
      case 'reinterpretar': {
        capturaId = l.capturaId
        const { interpretacion, uso } = await interpretar(l.texto, ctx, l.borrador)
        await db.actualizarCaptura(l.capturaId, {
          notas: [`Corrección: "${l.texto}"`],
          tokensEntrada: uso.entrada,
          tokensSalida: uso.salida,
        })
        await avanzar(v, ctx, l.capturaId, corregir(l.borrador, interpretacion, ctx), [])
        return
      }
      case 'nuevo': {
        if (l.abandona) await abandonar(l.abandona)
        capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada: porAudio ? 'audio' : botonId ? 'boton' : 'texto', texto })
        const { interpretacion, uso } = await interpretar(texto, ctx)
        await db.actualizarCaptura(capturaId, {
          interpretacion,
          interpretadoPor: 'claude-haiku-4-5',
          tokensEntrada: uso.entrada,
          tokensSalida: uso.salida,
        })
        const a = arrancar(interpretacion, ctx)
        if ('respuesta' in a) {
          await db.guardarPendiente(v.id, null)
          await db.actualizarCaptura(capturaId, { estado: a.estado })
          await responder(v, m.from, { texto: a.respuesta })
          return
        }
        await avanzar(v, ctx, capturaId, a.borrador, [])
        return
      }
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('wa-webhook', detalle)
    if (capturaId) await db.actualizarCaptura(capturaId, { estado: 'error', notas: [`Error: ${detalle.slice(0, 500)}`] }).catch(() => {})
    await db.guardarPendiente(v.id, null).catch(() => {})
    await responder(v, m.from, { texto: ERROR }).catch(() => {})
  }
}

async function abandonar(capturaId: string): Promise<void> {
  await db.actualizarCaptura(capturaId, {
    estado: 'incompleta',
    notas: ['Quedó a medias: el productor mandó otra cosa.'],
  })
}

async function avanzar(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador, notasPrevias: string[]): Promise<void> {
  const paso: Paso = siguientePaso(capturaId, b, ctx)
  const notas = [...notasPrevias, ...paso.notas]
  const to = v.telefono
  switch (paso.k) {
    case 'preguntar':
      await db.guardarPendiente(v.id, paso.pendiente)
      await db.actualizarCaptura(capturaId, { notas })
      await responder(v, to, paso.mensaje)
      return
    case 'proponer':
      await db.guardarPendiente(v.id, paso.pendiente)
      await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: paso.borrador, notas })
      await responder(v, to, paso.mensaje)
      return
    case 'decir':
      await db.guardarPendiente(v.id, null)
      await db.actualizarCaptura(capturaId, { estado: 'descartada', notas })
      await responder(v, to, paso.mensaje)
      return
    case 'consultar': {
      await db.guardarPendiente(v.id, null)
      const texto = await consultar(v, ctx, paso.borrador)
      await db.actualizarCaptura(capturaId, { estado: 'respondida', propuesta: paso.borrador, notas })
      await responder(v, to, { texto })
      return
    }
  }
}

async function consultar(v: db.Vinculo, ctx: Contexto, b: Borrador): Promise<string> {
  const campo = campoPorId(ctx.campos, b.campoId)
  const potrero = potreroPorId(ctx.campos, b.potreroId)
  switch (b.tipo) {
    case 'consulta_hacienda':
      return R.hacienda(await db.hacienda(v, b), { campo: potrero?.campo.nombre ?? campo?.nombre, potrero: potrero?.potrero.nombre })
    case 'consulta_lluvia': {
      const filas = await db.lluviaMes(v, b.campoId ?? null, ctx.hoy)
      return R.lluviaConsulta(ctx.hoy, filas.map((f) => ({ campo: f.campo, mesMm: f.mes_mm, anteriorMm: f.ant_mm })))
    }
    case 'consulta_vencimientos': {
      const { hasta, filas } = await db.vencimientos(v, ctx.hoy, b.periodo === 'mes' ? 30 : 7)
      return R.vencimientos(ctx.hoy, hasta, filas)
    }
    case 'consulta_dias_potrero': {
      if (!potrero) return '¿De qué potrero?'
      const grupos = await db.diasEnPotrero(v, potrero.potrero.id)
      return R.diasEnPotrero(ctx.hoy, { campo: potrero.campo.nombre, potrero: potrero.potrero.nombre, grupos })
    }
    default:
      return QUE_PUEDO
  }
}

async function confirmar(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador): Promise<void> {
  const to = v.telefono
  await db.guardarPendiente(v.id, null)
  // Si dos "Sí" llegan juntos, sólo uno escribe.
  if (!(await db.tomarPropuesta(capturaId))) {
    await responder(v, to, { texto: 'Eso ya estaba anotado. No lo cargo de nuevo.' })
    return
  }
  try {
    if (b.tipo === 'lluvia') {
      const id = await db.escribirLluvia(v, b)
      await db.actualizarCaptura(capturaId, { escritoTabla: 'lluvia', escritoId: id })
      const [f] = await db.lluviaMes(v, b.campoId!, ctx.hoy)
      await responder(v, to, {
        texto: R.trasLluvia({ campo: f.campo, hoy: ctx.hoy, mesMm: f.mes_mm, anteriorMm: f.ant_mm }),
      })
      return
    }
    if (b.tipo === 'gasto') {
      const id = crypto.randomUUID()
      let url: string | null = null
      if (b.fotoMediaId) {
        try {
          const f = await meta.descargarMedia(b.fotoMediaId)
          url = await db.subirComprobante(v.empresa_id, id, f.bytes, f.mime)
        } catch (e) {
          await db.actualizarCaptura(capturaId, { notas: [`No se pudo guardar la foto: ${e instanceof Error ? e.message : e}`] })
        }
      }
      await db.escribirGasto(v, b, url, id)
      await db.actualizarCaptura(capturaId, { escritoTabla: 'movimiento_financiero', escritoId: id })
      const g = await db.gastoMes(v, b.categoriaId!, ctx.hoy)
      const cat = ctx.categoriasGasto.find((c) => c.id === b.categoriaId)?.nombre ?? 'esa categoría'
      await responder(v, to, { texto: R.trasGasto({ hoy: ctx.hoy, categoria: cat, total: g.total, cantidad: g.cantidad }) })
      return
    }
  } catch (e) {
    await db.actualizarCaptura(capturaId, { estado: 'error', notas: [`Falló la escritura: ${e instanceof Error ? e.message : e}`] })
    throw e
  }
}

async function foto(
  v: db.Vinculo,
  ctx: Contexto & { categoriasOcr: { id: string; nombre: string; grupo: string | null; aplica_a: string | null }[] },
  capturaId: string,
  img: NonNullable<MensajeMeta['image']>,
): Promise<void> {
  const to = v.telefono
  const f = await meta.descargarMedia(img.id)
  const c = await leerComprobante(f.bytes, f.mime, ctx.categoriasOcr)
  await db.actualizarCaptura(capturaId, { interpretacion: c, interpretadoPor: 'extraer-comprobante' })
  if (!c.monto) {
    await db.actualizarCaptura(capturaId, { estado: 'error', notas: ['La foto no se leyó como comprobante.'] })
    await db.guardarPendiente(v.id, null)
    await responder(v, to, { texto: 'No pude leer eso como un ticket o factura. ¿Me mandás otra foto, de frente y con luz?' })
    return
  }
  if (c.tipo === 'ingreso') {
    await db.actualizarCaptura(capturaId, { estado: 'descartada', notas: ['El comprobante parece un ingreso: por ahora sólo gastos.'] })
    await db.guardarPendiente(v.id, null)
    await responder(v, to, { texto: 'Eso parece un cobro. Por ahora por acá anoto sólo gastos; los cobros cargalos en la app.' })
    return
  }
  const borrador: Borrador = {
    tipo: 'gasto',
    monto: c.monto,
    fecha: esFecha(c.fecha) ? c.fecha : null,
    contraparte: c.contraparte,
    cuit: c.cuit,
    comprobanteTipo: c.comprobante_tipo,
    descripcion: c.descripcion,
    ivaLineas: c.iva_lineas ?? [],
    categoriaId: ctx.categoriasGasto.some((x) => x.id === c.categoria_id) ? c.categoria_id : null,
    campoMencion: img.caption ?? null,
    fotoMediaId: img.id,
  }
  const notas = c.confianza === 'baja' ? ['Lectura de confianza baja: revisar.'] : []
  await avanzar(v, ctx, capturaId, borrador, notas)
}
