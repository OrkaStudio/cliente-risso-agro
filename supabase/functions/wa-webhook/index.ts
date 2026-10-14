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
import { comandoSemanal, periodoSemana } from '../_shared/wa/semanal.ts'
import { enviarSolicitado } from '../wa-resumen-semanal/servicio.ts'
import { configurar } from '../wa-resumen-semanal/store.ts'

import {
  arrancar,
  ayudaConPendiente,
  AUDIO_PRONTO,
  conUbicacion,
  corregir,
  leer,
  QUE_PUEDO,
  siguientePaso,
  type Paso,
} from '../_shared/wa/conversacion.ts'
import { confirmarConVerificacion } from '../_shared/wa/confirmacion.ts'
import { pistaTranscripcion } from '../_shared/wa/interpretar.ts'
import * as R from '../_shared/wa/respuestas.ts'
import { campoPorId, potreroEnPunto, potreroPorId } from '../_shared/wa/resolver.ts'
import { esFecha, finDeMes, hoyAR, inicioSemana, sumarDias } from '../_shared/wa/texto.ts'
import type { Borrador, Contexto, Mensaje, Pendiente } from '../_shared/wa/tipos.ts'
import * as db from './db.ts'
import { interpretar, leerComprobante, transcribir } from './llm.ts'
import * as meta from './meta.ts'
import { atenderMapa, campoParaMapa, comandoMapa, elegirMapa, noRecuerdaPotrero, type PedidoMapa } from '../_shared/wa/mapa.ts'
import { imagenMapa } from './mapa-imagen.ts'

const NO_VINCULADO =
  'Hola. Tu número no está vinculado a una cuenta de Tropero. Para vincularlo, contactá al equipo de Orka.'
const ERROR = 'No pude procesar el mensaje ahora. Probá de nuevo en un rato.'
/** Después de esto, lo que el bot preguntó se da por abandonado. */
const PENDIENTE_VENCE_MS = 12 * 60 * 60 * 1000
/** La ubicación compartida vale mientras está en ese potrero: después se mueve. */
const UBICADO_VENCE_MS = 60 * 60 * 1000

type MensajeMeta = {
  id: string
  from: string
  type: string
  text?: { body: string }
  interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  button?: { payload: string; text: string }
  image?: { id: string; mime_type: string; caption?: string }
  audio?: { id: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
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
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(tarea)
  else await tarea
}

async function responder(v: db.Vinculo | null, to: string, m: Mensaje): Promise<void> {
  for (const parte of meta.prepararMensajes(m)) {
    const r = await meta.enviar(to, parte)
    await db.guardarSaliente({ wamid: r.wamid, telefono: to, vinculo: v, cuerpo: r.cuerpo })
  }
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
  const edad = v.pendiente_at ? Date.now() - new Date(v.pendiente_at).getTime() : 0
  if (pendiente && edad > (pendiente.tipo === 'ubicado' ? UBICADO_VENCE_MS : PENDIENTE_VENCE_MS)) {
    if (pendiente.capturaId) {
      await db.actualizarCaptura(pendiente.capturaId, { estado: 'incompleta', notas: ['Quedó sin respuesta más de 12 horas.'] })
    }
    await db.guardarPendiente(v.id, null)
    pendiente = null
  }

  let capturaId: string | null = null
  try {
    if (m.type === 'location' && m.location) {
      await ubicacion(v, ctx, pendiente, m.location)
      return
    }
    if (m.type === 'image' && m.image) {
      capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada: 'foto', texto: m.image.caption ?? null })
      if (pendiente?.capturaId) await abandonar(pendiente.capturaId)
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
        await responder(v, m.from, { texto: 'No pude entender el audio. ¿Me lo escribís? No se cargó nada.' })
        return
      }
    }

    if (!botonId && !texto) {
      await responder(v, m.from, { texto: 'No puedo leer ese mensaje. Mandame texto, un audio o una foto del ticket o la factura.' })
      return
    }

    // Comandos explícitos: funcionan también por audio y conservan cualquier carga pendiente.
    const mapa = comandoMapa(texto, botonId)
    if (mapa) { await mostrarMapa(v, ctx, pendiente, mapa); return }
    if (!botonId && noRecuerdaPotrero(texto, pendiente)) {
      await db.guardarPendiente(v.id, pendiente)
      await responder(v, m.from, { texto: 'Conservé la observación pendiente de ubicar. Podés pedirme «mapa» y responder con el potrero cuando lo reconozcas; no hace falta repetir el audio.', botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }] })
      return
    }
    const weekly = !botonId ? comandoSemanal(texto ?? '') : null
    if (weekly) {
      if (Deno.env.get('WA_WEEKLY_ENABLED') !== 'true') {
        // El paquete puede incluir código preparado, pero no consulta las tablas
        // del resumen ni ofrece documentos hasta activar su piloto completo.
        await responder(v, m.from, { texto: 'El resumen semanal todavía no está activado en este piloto. Tu carga pendiente se conserva. Por ahora podés consultar lluvia, gastos, novedades o qué falta recorrer.' })
      } else if (weekly === 'ver') {
        await enviarSolicitado(v, periodoSemana())
      } else {
        await configurar(v, weekly === 'activar')
        await responder(v, m.from, { texto: weekly === 'activar'
          ? 'Activé tu resumen semanal: los sábados a las *09:00, hora de Argentina*. Cubre los siete días completos anteriores, con lluvia, recorridas, novedades, gastos, hacienda y vencimientos. Para dejar de recibirlo: «desactivar resumen semanal».'
          : 'Desactivé el resumen semanal. Podés seguir pidiéndome el documento cuando quieras.' })
      }
      return
    }
    const l = leer({ texto, botonId }, pendiente, ctx)
    switch (l.k) {
      case 'ayuda':
        await responder(v, m.from, { texto: ayudaConPendiente(pendiente, ctx) })
        return
      case 'viejo': {
        const guardada = await db.verificarCargaDeCaptura(v, l.capturaId).catch(() => null)
        await responder(v, m.from, {
          texto: guardada === true
            ? 'Esa carga ya está guardada. No la cargué otra vez.'
            : 'Ese botón corresponde a una propuesta anterior o que sigue en proceso. No volví a cargarla.',
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
        await responder(v, m.from, {
          texto: l.borrador.tipo === 'recorrida'
            ? 'Mandámelo de nuevo como tiene que quedar, en texto o audio.'
            : 'Decime qué cambio. Por ejemplo: "eran 25" o "en otro campo".',
        })
        return
      case 'seguir':
        capturaId = l.capturaId
        await avanzar(v, ctx, l.capturaId, l.borrador, [])
        return
      case 'reinterpretar': {
        capturaId = l.capturaId
        if (l.borrador.tipo === 'recorrida') {
          // Una recorrida se corrige mandándola de nuevo: reemplaza la propuesta.
          const { interpretacion, uso } = await interpretar(l.texto, ctx)
          await db.actualizarCaptura(l.capturaId, {
            notas: [`Corrección: "${l.texto}"`], tokensEntrada: uso.entrada, tokensSalida: uso.salida,
          })
          const a = arrancar(interpretacion, ctx, l.texto, { campoHoy: l.borrador.campoId ?? null })
          if ('respuesta' in a || a.borrador.tipo !== 'recorrida') {
            await responder(v, m.from, { texto: 'No lo entendí como una recorrida. Mandame de nuevo qué viste y en qué potrero.' })
            return
          }
          await avanzar(v, ctx, l.capturaId, a.borrador, [])
          return
        }
        const { interpretacion, uso } = await interpretar(l.texto, ctx, l.borrador)
        await db.actualizarCaptura(l.capturaId, {
          notas: [`Corrección: "${l.texto}"`],
          tokensEntrada: uso.entrada,
          tokensSalida: uso.salida,
        })
        await avanzar(v, ctx, l.capturaId, corregir(l.borrador, interpretacion, ctx, l.texto), [])
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
        const ubicado = pendiente?.tipo === 'ubicado' ? pendiente.ubicado : null
        const campoHoy = interpretacion.intent === 'novedad' ? await db.campoRecorridoHoy(v, ctx.hoy).catch(() => null) ?? await db.campoMapaReciente(v).catch(() => null) : null
        const a = arrancar(interpretacion, ctx, texto, { ubicado, campoHoy })
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

async function mostrarMapa(v: db.Vinculo, ctx: Contexto, pendiente: Pendiente | null, pedido: PedidoMapa, automatico = false): Promise<boolean> {
  try {
    const reciente = await db.campoMapaReciente(v).catch(() => null) ?? await db.campoRecorridoHoy(v, ctx.hoy).catch(() => null)
    const campo = campoParaMapa(pedido, ctx, pendiente, reciente)
    if (!campo) { if (!automatico) await responder(v, v.telefono, elegirMapa(ctx, Boolean(pedido.nombre || pedido.campoId))); return false }
    const capturaId = pendiente?.capturaId ?? null
    if (automatico && capturaId && await db.mapaEnviadoParaCaptura(v, capturaId, campo.id)) return true
    return await atenderMapa(campo, {
      datos: id => db.datosMapa(v, id), render: datos => imagenMapa(datos, ctx.hoy),
      responder: m => responder(v, v.telefono, m),
      enviarImagen: async (bytes, caption, campoId) => {
        const mediaId = await meta.subirImagen(bytes, 'tropero-mapa.png')
        const r = await meta.enviarImagen(v.telefono, mediaId, caption)
        await db.guardarSaliente({ wamid: r.wamid, telefono: v.telefono, vinculo: v, cuerpo: { ...r.cuerpo, tropero_mapa: { campo_id: campoId, captura_id: capturaId } } })
      },
    })
  } catch (e) {
    console.warn('wa-webhook: no se pudo preparar o enviar el mapa', e instanceof Error ? e.message : String(e))
    if (!automatico) await responder(v, v.telefono, { texto: 'No pude enviar el mapa ahora. Conservé tu carga pendiente; podés escribir el nombre del potrero o pedirme el mapa nuevamente.' }).catch(() => {})
    return false
  }
}

async function avanzar(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador, notasPrevias: string[]): Promise<void> {
  const paso: Paso = siguientePaso(capturaId, b, ctx)
  const notas = [...notasPrevias, ...paso.notas]
  const to = v.telefono
  switch (paso.k) {
    case 'preguntar':
      if (paso.pendiente.tipo === 'campo' && paso.pendiente.confirmaAlElegir) {
        // La pregunta ya es una propuesta: la elección será su confirmación.
        await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: paso.pendiente.borrador, notas })
      }
      await db.guardarPendiente(v.id, paso.pendiente)
      if (!(paso.pendiente.tipo === 'campo' && paso.pendiente.confirmaAlElegir))
        await db.actualizarCaptura(capturaId, { notas })
      await responder(v, to, paso.mensaje)
      if (paso.pendiente.tipo === 'potrero' || paso.pendiente.tipo === 'ubicacion') {
        if (!(await mostrarMapa(v, ctx, paso.pendiente, {}, true)))
          await responder(v, to, { texto: 'Para reconocer los potreros, podés pedirme «mapa». Tu audio se conserva.', botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }] })
      }
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
  const desde = b.periodo === 'anio' ? `${ctx.hoy.slice(0, 4)}-01-01` : b.periodo === 'semana' ? inicioSemana(ctx.hoy) : `${ctx.hoy.slice(0, 7)}-01`
  switch (b.tipo) {
    case 'consulta_recorrida':
      return R.resumenRecorrida(ctx.hoy, await db.resumenRecorrida(v, ctx.hoy, b.campoId ?? null))
    case 'consulta_observacion':
      return R.ultimaObservacion(await db.ultimaObservacion(v, b.potreroId!), potrero?.potrero.nombre ?? 'ese potrero', potrero?.campo.nombre ?? '')
    case 'consulta_novedades': {
      const inicio = b.periodo ? desde : sumarDias(ctx.hoy, -6)
      return R.novedades(inicio, ctx.hoy, await db.novedades(v, inicio, ctx.hoy, b.campoId ?? null))
    }
    case 'consulta_gastos':
      return R.resumenGastos(desde, ctx.hoy, await db.resumenGastos(v, desde, ctx.hoy, b.campoId ?? null, b.categoriaId ?? null))
    case 'consulta_cargas':
      return R.cargasRecientes(await db.cargasRecientes(v, b.campoId ?? null))
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
    const guardada = await db.verificarCargaDeCaptura(v, capturaId).catch(() => null)
    await responder(v, to, {
      texto: guardada === true
        ? 'Esa carga ya está guardada. No la cargué otra vez.'
        : 'Esa confirmación ya se está procesando o no está disponible. No volví a cargarla.',
    })
    return
  }

  if (b.tipo === 'recorrida') {
    await confirmarRecorrida(v, ctx, capturaId, b)
    return
  }
  if (b.tipo !== 'lluvia' && b.tipo !== 'gasto') return
  // Registrar el campo elegido sólo después de ganar el bloqueo de confirmación.
  await db.actualizarCaptura(capturaId, { propuesta: b })
  // Se elige antes de escribir para comprobar incluso un commit cuya respuesta se perdió.
  const id = crypto.randomUUID()
  const tabla: db.TablaCarga = b.tipo === 'lluvia' ? 'lluvia' : 'movimiento_financiero'
  let url: string | null = null
  if (b.tipo === 'gasto' && b.fotoMediaId) {
    try {
      const f = await meta.descargarMedia(b.fotoMediaId)
      url = await db.subirComprobante(v.empresa_id, id, f.bytes, f.mime)
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e)
      console.error('wa-webhook foto', detalle)
      await db.actualizarCaptura(capturaId, { notas: [`No se pudo guardar la foto: ${detalle.slice(0, 500)}`] })
    }
  }

  const fotoFalto = b.fotoMediaId && !url
    ? '\n\nNo pude guardar la foto del ticket; guardá el comprobante.'
    : ''
  const fecha = b.fecha ?? ctx.hoy
  const campo = campoPorId(ctx.campos, b.campoId!)?.nombre ?? 'el campo'
  const lluvia = b.tipo === 'lluvia' ? { campo, mm: b.mm!, fecha, hoy: ctx.hoy } : null
  const gasto = {
    monto: b.monto ?? 0, campo, fecha, hoy: ctx.hoy,
    categoria: ctx.categoriasGasto.find((c) => c.id === b.categoriaId)?.nombre ?? 'esa categoría',
  }
  const resultado = await confirmarConVerificacion({
    escribir: () => b.tipo === 'lluvia' ? db.escribirLluvia(v, b, id) : db.escribirGasto(v, b, url, id),
    verificar: () => db.verificarCarga(v, tabla, id),
    mensajeGuardada: lluvia ? R.lluviaAnotada(lluvia) : `${R.gastoAnotado(gasto)}${fotoFalto}`,
    resumir: async () => {
      if (lluvia) {
        // Un mes ya terminado se cuenta entero; el actual, hasta hoy.
        const hasta = fecha.slice(0, 7) < ctx.hoy.slice(0, 7) ? finDeMes(fecha) : ctx.hoy
        const [f] = await db.lluviaMes(v, b.campoId!, hasta)
        return R.trasLluvia({ ...lluvia, campo: f.campo, mesMm: f.mes_mm, anteriorMm: f.ant_mm })
      }
      const g = await db.gastoMes(v, b.categoriaId!, fecha)
      return R.trasGasto({
        ...gasto, total: g.total, cantidad: g.cantidad,
        fotoGuardada: b.fotoMediaId ? url !== null : null,
      })
    },
  })

  await db.actualizarCaptura(capturaId, {
    estado: resultado.estado === 'guardada' ? 'confirmada' : 'error',
    escritoTabla: tabla,
    escritoId: id,
    notas: resultado.error ? [`Verificación de carga: ${resultado.estado}. Error: ${resultado.error.slice(0, 500)}`] : [],
  }).catch((e) => console.error('wa-webhook registrar confirmación', e))
  // Un fallo de registro técnico o de envío no cambia una escritura ya confirmada.
  await responder(v, to, { texto: resultado.texto }).catch((e) => console.error('wa-webhook enviar confirmación', e))
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

/** La recorrida: todas las observaciones del mensaje en una transacción, con ids elegidos antes. */
async function confirmarRecorrida(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador): Promise<void> {
  await db.actualizarCaptura(capturaId, { propuesta: b })
  const obs: db.ObsEscrita[] = (b.observaciones ?? []).filter((o) => o.potreroId && o.campoId).map((o) => ({
    id: crypto.randomUUID(),
    potreroId: o.potreroId!,
    campoId: o.campoId!,
    agua: o.agua,
    pasto: o.pasto,
    electrico: o.electrico,
    conteo: o.conteo,
    novedad: o.novedad,
  }))
  let ids: string[] = []
  const fecha = b.fecha ?? ctx.hoy
  const resultado = await confirmarConVerificacion({
    escribir: async () => {
      ids = await db.escribirRecorrida(v, fecha, obs)
    },
    verificar: () => db.verificarRecorrida(v, fecha, obs),
    mensajeGuardada: R.recorridaAnotada(new Set(obs.map((o) => o.potreroId)).size, fecha, ctx.hoy),
    resumir: async () => {
      const campos = [...new Set(obs.map((o) => o.campoId))]
      return R.trasRecorrida(new Set(obs.map((o) => o.potreroId)).size, await db.avanceRecorrida(v, fecha, campos), fecha, ctx.hoy)
    },
  })
  await db.actualizarCaptura(capturaId, {
    estado: resultado.estado === 'guardada' ? 'confirmada' : 'error',
    escritoTabla: 'observacion_potrero',
    escritoId: ids[0] ?? obs[0]?.id,
    notas: [
      ...(ids.length > 1 ? [`Observaciones: ${ids.join(', ')}`] : []),
      ...(resultado.error ? [`Verificación de carga: ${resultado.estado}. Error: ${resultado.error.slice(0, 500)}`] : []),
    ],
  }).catch((e) => console.error('wa-webhook registrar recorrida', e))
  await responder(v, v.telefono, { texto: resultado.texto }).catch((e) => console.error('wa-webhook enviar recorrida', e))
}

/**
 * Compartió la ubicación. Si el bot la pidió para una recorrida, completa el
 * potrero de lo que dijo "acá"; si no, la guarda para el próximo mensaje.
 */
async function ubicacion(
  v: db.Vinculo, ctx: Contexto, pendiente: Pendiente | null, loc: { latitude: number; longitude: number },
): Promise<void> {
  const to = v.telefono
  const p = potreroEnPunto(loc.latitude, loc.longitude, await db.potrerosDibujados(v))
  if (pendiente?.tipo === 'ubicacion') {
    if (!p) {
      await responder(v, to, { texto: 'Esa ubicación no cae dentro de ningún potrero dibujado. Escribime el número del potrero.' })
      return
    }
    const u = { potreroId: p.id, campoId: p.campoId }
    await avanzar(v, ctx, pendiente.capturaId, conUbicacion(pendiente.borrador, u, pendiente.obsIndex), [`Ubicación: ${p.nombre} de ${p.campo}.`])
    return
  }
  if (pendiente?.capturaId) await abandonar(pendiente.capturaId)
  if (!p) {
    await db.guardarPendiente(v.id, null)
    await responder(v, to, { texto: 'No estás dentro de ningún potrero dibujado. Contame qué viste y en qué potrero.' })
    return
  }
  await db.guardarPendiente(v.id, { tipo: 'ubicado', capturaId: null, ubicado: { potreroId: p.id, campoId: p.campoId } })
  await responder(v, to, { texto: `Estás en el *${p.nombre}* de ${p.campo}. Contame qué ves.` })
}
