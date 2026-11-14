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
import { permiso, soloManda } from '../_shared/wa/permisos.ts'
import { comandoSemanal, periodoSemana } from '../_shared/wa/semanal.ts'
import { enviarSolicitado } from '../wa-resumen-semanal/servicio.ts'
import { configurar } from '../wa-resumen-semanal/store.ts'

import {
  arrancar,
  ayuda,
  ayudaConPendiente,
  comoSePaga,
  AUDIO_PRONTO,
  conUbicacion,
  corregir,
  leer,
  QUE_PUEDO,
  siguientePaso,
  preguntaRecorrida,
  type Paso,
} from '../_shared/wa/conversacion.ts'
import { confirmarConVerificacion, type EstadoCarga } from '../_shared/wa/confirmacion.ts'
import { niegaRecorrida, nombraHacienda, periodoRepreguntaLluvia, preguntaLluvia } from '../_shared/wa/consulta-lluvia.ts'
import { EntradaIncompleta, limpiarInterpretacion, pistaTranscripcion } from '../_shared/wa/interpretar.ts'
import { Turnos,secretoValido } from '../_shared/wa/servicios.ts'
import * as R from '../_shared/wa/respuestas.ts'
import { campoPorId, potreroEnPunto, potreroPorId, resolverParaMostrar } from '../_shared/wa/resolver.ts'
import { esFecha, finDeMes, hoyAR, inicioSemana, sumarDias, norm, plural } from '../_shared/wa/texto.ts'
import type { Borrador, Contexto, Mensaje, Pendiente, PendienteInfra, PendienteMortandad, PendienteTurno } from '../_shared/wa/tipos.ts'
import * as db from './db.ts'
import { interpretar, leerComprobante, transcribir } from './llm.ts'
import { corregirMortandad, resumenMortandad, textoRevisionMortandad } from './mortandad.ts'
import { actualizarPasoTurno, continuarTurno, incorporarTurno, type BorradorTurno, type IOCompuesto } from './turno-compuesto.ts'
import * as meta from './meta.ts'
import { atenderMapa, campoParaMapa, comandoMapa, elegirMapa, noRecuerdaPotrero, type PedidoMapa } from '../_shared/wa/mapa.ts'
import { imagenMapa } from './mapa-imagen.ts'
import { colaHabilitada, tomarTrabajo, terminarTrabajo, canalEnRevision,canalesConTrabajo } from './cola.ts'
import { atenderPiloto } from './piloto.ts'
import { atenderInfra, cargarEnUbicacion, ofrecerCarga, type IOInfra } from './infra.ts'
import { potreroCercano } from '../_shared/wa/infraestructura.ts'
import * as pilotoStore from './piloto-store.ts'
import { fusionarRecorrida } from '../_shared/wa/piloto.ts'

const NO_VINCULADO =
  'Hola. Tu número no está vinculado a una cuenta de Troppero. Para pedir acceso, escribí a francisco@troppero.com.'
const ERROR = 'No pude procesar el mensaje ahora. Probá de nuevo en un rato.'
/** Después de esto, lo que el bot preguntó se da por abandonado. */
const PENDIENTE_VENCE_MS = 12 * 60 * 60 * 1000
/** La ubicación compartida vale mientras está en ese potrero: después se mueve. */
const UBICADO_VENCE_MS = 60 * 60 * 1000
const turnos = new Turnos()
const recepciones = new Turnos()

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
  if (url.searchParams.get('job')==='queue') {
    if(req.method!=='POST' || !colaHabilitada() || !secretoValido(Deno.env.get('WA_QUEUE_JOB_TOKEN'),req.headers.get('x-wa-queue-token'))) return new Response('forbidden',{status:403})
    const body=await req.text()
    if(body!==''&&body.trim()!=='{}')return new Response('invalid body',{status:400})
    const trabajos=await canalesConTrabajo()
    const tarea=Promise.all(trabajos.map(v=>turnos.ejecutar(v.telefono,()=>drenarCola(v))))
    const rt=(globalThis as unknown as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime
    if(rt?.waitUntil)rt.waitUntil(tarea);else await tarea
    return new Response('ok')
  }

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
  const mensajesPorNumero = new Map<string, MensajeMeta[]>()
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      for (const s of (value.statuses as { id: string; status: string; errors?: unknown }[]) ?? []) {
        trabajos.push(db.actualizarEstado(s.id, s.status, s.errors ?? null).catch((e) => console.error('estado', e)))
      }
      for (const m of (value.messages as MensajeMeta[]) ?? []) {
        const lote = mensajesPorNumero.get(m.from)
        if (lote) lote.push(m)
        else mensajesPorNumero.set(m.from, [m])
      }
    }
  }
  for (const [numero, lote] of mensajesPorNumero) {
    trabajos.push(recepciones.ejecutar(numero, async () => {
      // Si falta un mensaje, el siguiente podría responder a una propuesta anterior.
      for (const m of lote) await recibir(m)
    }))
  }
  // Sólo confirmar la recepción cuando se guardó el lote completo.
  const fallas = (await Promise.allSettled(trabajos)).filter(r => r.status === 'rejected')
  for (const falla of fallas) console.error('recibir', falla.reason instanceof Error ? falla.reason.message : falla.reason)
  return fallas.length ? new Response('retry', { status: 503 }) : new Response('ok')
})

/** Guarda el mensaje (una sola vez por wamid) y deja el procesamiento en segundo plano. */
async function recibir(m: MensajeMeta): Promise<void> {
  const vinculo = await db.vinculoDe(m.from)
  // Un número sin vincular: sólo el registro técnico, no su contenido.
  const cuerpo = vinculo ? m : { type: m.type, sin_vincular: true }
  const mensajeId = await db.guardarEntrante({ wamid: m.id, telefono: m.from, tipo: m.type, cuerpo, vinculo })
  if (!mensajeId) return // Meta lo reenvió: ya se procesó.
  const tarea = turnos.ejecutar(m.from, async () => {
    if (!vinculo || !colaHabilitada(vinculo.empresa_id)) return procesar(m, mensajeId, await db.vinculoDe(m.from))
    await drenarCola(vinculo,true)
  }).catch((e) => console.error('procesar', e))
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(tarea)
  else await tarea
}

async function drenarCola(vinculo:db.Vinculo,avisar=false):Promise<void>{
    for (let i = 0; i < 8; i++) {
      const job = await tomarTrabajo(vinculo.id)
      if (!job) {
        if (avisar && await canalEnRevision(vinculo.id)) await responder(vinculo, vinculo.telefono, { texto: 'Hay un mensaje cuyo guardado necesita revisión. Conservé los siguientes en espera para evitar duplicados. Contactá a Fran o Lau antes de reenviarlos.' })
        break
      }
      try {
        const actual = await db.vinculoDe(vinculo.telefono)
        if (!actual || actual.id !== vinculo.id || actual.empresa_id !== vinculo.empresa_id) throw new Error('El vínculo cambió; revisar antes de procesar')
        if ((job.cuerpo as MensajeMeta).from !== vinculo.telefono) throw new Error('Mensaje de otro vínculo')
        await procesar(job.cuerpo as MensajeMeta, job.mensajeId, actual)
        await terminarTrabajo(job.mensajeId, job.token)
      } catch (e) { await terminarTrabajo(job.mensajeId, job.token, true); throw e }
    }
}

async function responder(v: db.Vinculo | null, to: string, m: Mensaje): Promise<void> {
  for (const parte of meta.prepararMensajes(m)) {
    const r = await meta.enviar(to, parte)
    await db.guardarSaliente({ wamid: r.wamid, telefono: to, vinculo: v, cuerpo: r.cuerpo })
  }
}

async function procesar(m: MensajeMeta, mensajeId: string, v: db.Vinculo | null): Promise<void> {
  if (!v) {
    // Una cuenta de la empresa o una invitación «Sólo por WhatsApp»: queda vinculado con este mensaje (permisos, 14/11).
    const auto = await db.autovincular(m.from).catch((e) => (console.error('autovincular', e), null))
    if (!auto) {
      await responder(null, m.from, { texto: NO_VINCULADO })
      return
    }
    const ctx = await db.contexto(auto.vinculo, hoyAR())
    const hola = auto.nuevo ? `Listo${auto.nombre ? `, ${auto.nombre}` : ''}: ya estás en Troppero, en ${auto.empresa}.` : `Listo: tu WhatsApp quedó conectado a Troppero, en ${auto.empresa}.`
    await responder(auto.vinculo, m.from, { texto: `${hola}\n\n${ayuda(ctx.nombre, ctx)}` })
    return
  }
  await meta.leidoYEscribiendo(m.id)
  const hoy = hoyAR()
  const ctx = { ...await db.contexto(v, hoy),fechaMensaje:await db.fechaDeEntrada(v,mensajeId), semanalHabilitado: Deno.env.get('WA_WEEKLY_ENABLED') === 'true', pilotoHabilitado: Deno.env.get('WA_PILOT_ENABLED') === 'true' && colaHabilitada(v.empresa_id) }

  // Lo que el bot preguntó hace mucho ya no se espera.
  let crudo = v.pendiente
  const edad = v.pendiente_at ? Date.now() - new Date(v.pendiente_at).getTime() : 0
  if (crudo && edad > (crudo.tipo === 'ubicado' ? UBICADO_VENCE_MS : PENDIENTE_VENCE_MS)) {
    const ids = crudo.tipo === 'turno'
      ? [...crudo.pasos.map(p => p.pendiente.capturaId), crudo.anterior?.capturaId]
      : [crudo.capturaId]
    for (const id of ids) {
      if (id) await db.actualizarCaptura(id, { estado: 'incompleta', notas: ['Quedó sin respuesta más de 12 horas.'] })
    }
    await db.guardarPendiente(v.id, null)
    crudo = null
  }
  // El inventario lleva su propio pendiente; el resto del flujo no lo ve.
  const pendienteInfra: PendienteInfra | null = crudo?.tipo === 'infra' ? crudo : null
  const pendienteMortandad = crudo?.tipo === 'mortandad' ? crudo : null
  const turno = crudo?.tipo === 'turno' ? crudo : null
  const pendiente: Pendiente | null = crudo?.tipo === 'infra' || crudo?.tipo === 'mortandad' || crudo?.tipo === 'turno' ? null : crudo
  const ioCompuesto: IOCompuesto = {
    responder: mensaje => responder(v, m.from, mensaje),
    consultar: borrador => consultar(v, ctx, borrador),
    confirmar: (id, b, p, estado, siguiente) => confirmar(v, ctx, id, b, p, { estado, siguiente }),
  }
  const compuesto = turno ? { turno, io: ioCompuesto } : undefined

  let capturaId: string | null = null
  const ioInfra: IOInfra = {
    responder: msg => responder(v, v.telefono, msg),
    enviarImagen: (bytes, caption, campoId) => enviarImagenMapa(v, bytes, caption, campoId, null),
  }
  try {
    if (m.type === 'location' && m.location) {
      if (pendienteInfra?.paso === 'ubicacion') {
        await cargarEnUbicacion({ v, ctx, mensajeId, texto: '', pendiente: pendienteInfra, entrada: 'texto' }, ioInfra, pendienteInfra, [m.location.latitude, m.location.longitude])
        return
      }
      if (pendienteInfra?.capturaId) await abandonar(pendienteInfra.capturaId)
      await ubicacion(v, ctx, turno?.pasos[0]?.pendiente ?? pendiente, m.location, compuesto)
      return
    }
    if (m.type === 'image' && m.image) {
      capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada: 'foto', texto: m.image.caption ?? null })
      await foto(v, ctx, capturaId, m.image, crudo?.capturaId, compuesto)
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

    if (!botonId && pendienteMortandad) {
      const comando = norm(texto).replace(/[¿?¡!.,]+$/g, '').trim()
      if (comando === 'cancelar mortandad' || comando === 'cancelar') {
        await db.guardarPendiente(v.id, null)
        await responder(v, m.from, { texto: 'Dejé sin efecto la revisión de mortandad.' })
        return
      }
      const corregida = corregirMortandad(pendienteMortandad.reporte, texto)
      if (corregida || /^(?:revisar mortandad|si|dale|ok)$/.test(comando)) {
        const reporte = corregida ?? pendienteMortandad.reporte
        if (corregida) await db.guardarPendiente(v.id, { ...pendienteMortandad, reporte })
        await responder(v, m.from, { texto: await textoRevisionMortandad(v, ctx, reporte) })
        return
      }
    }

    // Comandos explícitos: funcionan también por audio y conservan cualquier carga pendiente.
    if(!botonId && norm(texto)==='soporte'){
      await responder(v,m.from,{texto:'Para hablar con el equipo, escribí a francisco@troppero.com. Contanos qué intentaste cargar y cuándo. Tu carga pendiente se conserva. También podés pedir una copia de tus datos o la desvinculación del número.'})
      return
    }
    const mapa = comandoMapa(texto, botonId)
    if (mapa) { await mostrarMapa(v, ctx, turno?.pasos[0]?.pendiente ?? pendiente, mapa); return }
    if (!turno && await atenderInfra({ v, ctx, mensajeId, texto, botonId, pendiente: pendienteInfra ?? pendiente, entrada: porAudio ? 'audio' : botonId ? 'boton' : 'texto' }, ioInfra)) return
    if (!botonId && noRecuerdaPotrero(texto, pendiente)) {
      await db.guardarPendiente(v.id, pendiente)
      await responder(v, m.from, { texto: 'Conservé la observación pendiente de ubicar. Podés pedirme «mapa» y responder con el potrero cuando lo reconozcas; no hace falta repetir el audio.', botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }] })
      return
    }
    if (!botonId) {
      const retomar = /^retomar (recorrida|lluvia|gasto)$/.exec(norm(texto).replace(/[¿?¡!.]/g, '').trim())
      if (pendiente?.tipo === 'corregir' && retomar?.[1] === pendiente.borrador.tipo) {
        capturaId = pendiente.capturaId
        await avanzar(v, ctx, pendiente.capturaId, pendiente.borrador, [], mensajeId)
        return
      }
      const fechaEntrada = ctx.fechaMensaje ?? ctx.hoy
      const repregunta = periodoRepreguntaLluvia(texto, fechaEntrada)
      let lluvia = preguntaLluvia(texto, ctx.campos, fechaEntrada)
      if (repregunta) {
        const anterior = await db.ultimaConsultaLluvia(v)
        lluvia = anterior && (!anterior.campoId || campoPorId(ctx.campos, anterior.campoId))
          ? { borrador: { tipo: 'consulta_lluvia', campoId: anterior.campoId, fecha: repregunta.fecha } }
          : { texto: '¿Qué querés consultar para ese día? Decime también el campo si corresponde.' }
      }
      if (lluvia && !(turno && niegaRecorrida(texto))) {
        const pausa = await pausarRecorridaNegada(v, pendiente, texto)
        if ('texto' in lluvia) {
          await responder(v, m.from, { texto: lluvia.texto + pausa })
          return
        }
        const paso = siguientePaso('', lluvia.borrador, ctx)
        if (paso.k !== 'consultar') {
          await responder(v, m.from, { texto: 'mensaje' in paso ? paso.mensaje.texto : '¿De qué campo querés la lluvia?' })
          return
        }
        const respuesta = await consultar(v, ctx, paso.borrador)
        capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada: porAudio ? 'audio' : 'texto', texto })
        await db.actualizarCaptura(capturaId, { estado: 'respondida', propuesta: paso.borrador })
        capturaId = null
        await responder(v, m.from, { texto: respuesta + pausa })
        return
      }
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
    if (turno && await continuarTurno(v, ctx, turno, { texto, botonId, porAudio }, ioCompuesto)) return
    if (!turno && await atenderPiloto({v,ctx,mensajeId,texto,botonId,pendiente}, {
      responder: msg => responder(v,v.telefono,msg),
      limpiarPendiente: () => db.guardarPendiente(v.id,null),
      avanzar: async b => {
        capturaId = await db.crearCaptura({vinculo:v,mensajeId,entrada:porAudio?'audio':'texto',texto})
        await avanzar(v,ctx,capturaId,b,[],mensajeId)
      },
    })) return
    const l = leer({ texto, botonId }, pendiente, ctx)
    switch (l.k) {
      case 'ayuda':
        if (turno) {
          await responder(v, m.from, { texto: ayudaConPendiente(null, ctx) + '\n\nEscribí «ver pendientes» para seguir con lo que ya me mandaste.' })
          return
        }
        await responder(v, m.from, { texto: ayudaConPendiente(pendiente, ctx) + (pendienteInfra ? '\n\nSigue pendiente la carga de infraestructura. Podés responder la pregunta anterior o escribir «cancelar».' : '') })
        return
      case 'viejo': {
        const guardada = await db.verificarCargaDeCaptura(v, l.capturaId).catch(() => null)
        await responder(v, m.from, {
          texto: guardada === true
            ? 'Esa carga ya está guardada. No la cargué otra vez.'
            : 'Ese botón es de una propuesta anterior. Revisá la última antes de guardar.',
        })
        return
      }
      case 'confirmar':
        capturaId = l.capturaId
        await confirmar(v, ctx, l.capturaId, l.borrador, pendiente)
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
        await avanzar(v, ctx, l.capturaId, l.borrador, [], mensajeId,pendiente?.tipo==='ubicacion' && pendiente.confirmaAlElegir===true)
        return
      case 'reinterpretar': {
        capturaId = l.capturaId
        if (pendiente?.tipo === 'propuesta') await db.guardarPendiente(v.id, { tipo: 'corregir', capturaId, borrador: l.borrador })
        if (l.borrador.tipo === 'recorrida') {
          if (/^(?:(?:fue|era) )?(?:hoy|ayer|anteayer|\d{4}-\d{2}-\d{2})[.!?\s]*$/.test(l.texto.toLowerCase().trim())) {
            await avanzar(v,ctx,l.capturaId,corregir(l.borrador,limpiarInterpretacion({intent:'novedad'}),ctx,l.texto),[],mensajeId)
            return
          }
          // Una recorrida se corrige mandándola de nuevo: reemplaza la propuesta.
          const { interpretacion, uso } = await interpretar(l.texto, ctx)
          await db.actualizarCaptura(l.capturaId, {
            notas: [`Corrección: "${l.texto}"`], tokensEntrada: uso.entrada, tokensSalida: uso.salida,
          })
          const a = arrancar(interpretacion, ctx, l.texto, { campoHoy: l.borrador.campoId ?? null })
          if (!('respuesta' in a) && a.borrador.tipo.startsWith('consulta_')) {
            const pausa = await pausarRecorridaNegada(v, pendiente, l.texto)
            if (porAudio && a.borrador.tipo === 'consulta_hacienda' && !nombraHacienda(l.texto)) {
              await responder(v, m.from, { texto: ACLARAR_CONSULTA_AUDIO + pausa })
              return
            }
            capturaId = null
            const respuesta = await responderConsulta(v, ctx, l.capturaId, a)
            await responder(v, m.from, { texto: respuesta + pausa })
            return
          }
          if ('respuesta' in a || a.borrador.tipo !== 'recorrida') {
            await responder(v, m.from, { texto: 'Me perdí en esa parte. Para cambiar la recorrida, decime qué viste y en qué potrero.' })
            return
          }
          await avanzar(v, ctx, l.capturaId, {...a.borrador,sesionId:l.borrador.sesionId,cerrarSesion:l.borrador.cerrarSesion}, [], mensajeId)
          return
        }
        const { interpretacion, uso } = await interpretar(l.texto, ctx, l.borrador)
        if (interpretacion.intent.startsWith('consulta_')) {
          capturaId = null
          const tipo = l.borrador.tipo === 'gasto' ? 'el gasto' : 'la lluvia'
          const pausa = `\n\nDejé ${tipo} pendiente. Escribí «retomar ${l.borrador.tipo}» para volver a verlo.`
          const respuesta = porAudio && interpretacion.intent === 'consulta_hacienda' && !nombraHacienda(l.texto)
            ? ACLARAR_CONSULTA_AUDIO
            : await responderConsulta(v, ctx, l.capturaId, arrancar(interpretacion, ctx, l.texto))
          await responder(v, m.from, { texto: respuesta + pausa })
          return
        }
        await db.actualizarCaptura(l.capturaId, {
          notas: [`Corrección: "${l.texto}"`],
          tokensEntrada: uso.entrada,
          tokensSalida: uso.salida,
        })
        await avanzar(v, ctx, l.capturaId, corregir(l.borrador, interpretacion, ctx, l.texto), [], mensajeId)
        return
      }
      case 'nuevo': {
        const entrada = porAudio ? 'audio' : botonId ? 'boton' : 'texto'
        capturaId = await db.crearCaptura({ vinculo: v, mensajeId, entrada, texto })
        const { interpretacion, pedidos, uso } = await interpretar(texto, ctx, undefined, true)
        if (pedidos.length > 1 || turno) {
          const primera = capturaId
          capturaId = null
          const avisos: string[] = []
          const borradores: BorradorTurno[] = []
          const ubicado = pendiente?.tipo === 'ubicado' ? pendiente.ubicado : null
          const tieneNovedad = pedidos.some(p => p.interpretacion.intent === 'novedad')
          const campoHoy = tieneNovedad
            ? await db.campoRecorridoHoy(v, ctx.hoy).catch(() => null) ?? await db.campoMapaReciente(v).catch(() => null)
            : null
          const sesion = ctx.pilotoHabilitado && tieneNovedad ? await pilotoStore.sesionActiva(v) : null
          for (const [i, { fragmento, interpretacion: it }] of pedidos.entries()) {
            const id = i === 0 ? primera : await db.crearCaptura({ vinculo: v, mensajeId, entrada, texto: fragmento })
            await db.actualizarCaptura(id, {
              interpretacion: { ...it, fragmento }, interpretadoPor: 'claude-haiku-4-5',
              ...(i === 0 ? { tokensEntrada: uso.entrada, tokensSalida: uso.salida } : {}),
            })
            const ambiguo = porAudio && it.intent === 'consulta_hacienda' && !nombraHacienda(fragmento)
            if (ambiguo || (sesion && it.intent === 'novedad')) {
              avisos.push(ambiguo ? ACLARAR_CONSULTA_AUDIO : 'Tenés una recorrida abierta. La novedad quedó en este mensaje para que la retomes desde la sesión.')
              await db.actualizarCaptura(id, { estado: 'incompleta' })
              continue
            }
            const a = arrancar(it, ctx, fragmento, { ubicado, campoHoy })
            if ('respuesta' in a) {
              await db.actualizarCaptura(id, { estado: a.estado })
              avisos.push(a.respuesta)
              continue
            }
            if (it.mortandad) avisos.push('Conservé el aviso de mortandad en el mensaje. Revisá los animales en Hacienda para una baja.')
            borradores.push({ capturaId: id, borrador: a.borrador })
          }
          await incorporarTurno(v, ctx, crudo, borradores, avisos, ioCompuesto)
          return
        }
        await db.actualizarCaptura(capturaId, {
          interpretacion,
          interpretadoPor: 'claude-haiku-4-5',
          tokensEntrada: uso.entrada,
          tokensSalida: uso.salida,
        })
        if (porAudio && interpretacion.intent === 'consulta_hacienda' && !nombraHacienda(texto)) {
          await db.actualizarCaptura(capturaId, { estado: 'respondida' })
          await responder(v, m.from, { texto: ACLARAR_CONSULTA_AUDIO })
          return
        }
        const ubicado = pendiente?.tipo === 'ubicado' ? pendiente.ubicado : null
        const campoHoy = interpretacion.intent === 'novedad' ? await db.campoRecorridoHoy(v, ctx.hoy).catch(() => null) ?? await db.campoMapaReciente(v).catch(() => null) : null
        const mortandad = interpretacion.intent === 'lluvia'
          && (interpretacion.otrosRegistros ?? []).every(tipo => tipo === 'novedad' || tipo === 'hacienda')
          ? interpretacion.mortandad : null
        const a = arrancar(mortandad ? { ...interpretacion, otrosRegistros: [] } : interpretacion, ctx, texto, { ubicado, campoHoy })
        if ('respuesta' in a) {
          await db.actualizarCaptura(capturaId, { estado: a.estado })
          await responder(v, m.from, { texto: a.respuesta })
          return
        }
        // Lo que el dueño no le habilitó, se dice (permisos, 13/11): ni se consulta ni se propone cargar.
        const habilitado = permiso(ctx.niveles ?? null, a.borrador.tipo)
        if (!habilitado.ok) {
          await db.actualizarCaptura(capturaId, { estado: 'respondida' })
          await responder(v, m.from, { texto: habilitado.texto })
          return
        }
        if (a.borrador.tipo.startsWith('consulta_')) {
          const consulta = siguientePaso(capturaId, a.borrador, ctx)
          if (consulta.k === 'consultar') {
            await responder(v, m.from, { texto: await consultar(v, ctx, consulta.borrador) })
            await db.actualizarCaptura(capturaId, { estado: 'respondida', propuesta: consulta.borrador })
            return
          }
          if (pendiente?.capturaId || pendienteInfra || pendienteMortandad) {
            const respuesta = consulta.k === 'decir' ? consulta.mensaje.texto : 'Para esa consulta, incluí el campo o potrero en el mismo mensaje.'
            await db.actualizarCaptura(capturaId, { estado: 'respondida', notas: consulta.notas })
            await responder(v, m.from, { texto: respuesta + ' Conservé tu carga pendiente.' })
            return
          }
        }
        let b = mortandad ? { ...a.borrador, mortandad } : a.borrador
        if (ctx.pilotoHabilitado && b.tipo==='recorrida') {
          const s=await pilotoStore.sesionActiva(v)
          if (s) {
            if (b.fecha && b.fecha!==s.fecha) throw new EntradaIncompleta(`La sesión es del ${s.fecha}. Pausala antes de registrar una recorrida de otro día.`)
            b=fusionarRecorrida({...s.borrador,sesionId:s.id,campoId:s.campo_id,fecha:s.fecha},{...b,campoId:s.campo_id})
          }
        }
        // Sólo una nueva carga entendida reemplaza el inventario pendiente.
        // Ayuda, consultas, mensajes incompletos y fallos de IA lo conservan.
        if (pendienteInfra) {
          if (pendienteInfra.capturaId) await abandonar(pendienteInfra.capturaId)
          await db.guardarPendiente(v.id, null)
        }
        if (l.abandona) await abandonar(l.abandona)
        await avanzar(v, ctx, capturaId, b, [], mensajeId)
        return
      }
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('wa-webhook', detalle)
    if (capturaId) await db.actualizarCaptura(capturaId, { estado: 'error', notas: [`Error: ${detalle.slice(0, 500)}`] }).catch(() => {})
    // No borrar el borrador por un fallo de descarga/IA/respuesta.
    const explicacion = detalle.includes('Servicio de interpretación')
      ? 'Ahora no puedo entender mensajes nuevos. Probá más tarde.'
      : m.type === 'audio' ? 'No pude procesar ese audio. Podés mandarme un texto corto con lo mismo.'
      : m.type === 'image' ? 'No pude procesar esa foto. Probá mandarla de nuevo en un rato.' : ERROR
    const conserva = crudo && crudo.tipo !== 'ubicado' ? ' Tu borrador sigue pendiente.' : ''
    await responder(v, m.from, { texto: e instanceof EntradaIncompleta ? e.message : explicacion + conserva }).catch(() => {})
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
    let campo = campoParaMapa(pedido, ctx, pendiente, reciente)
    let focoId = pedido.potreroId
    if (pedido.potreroId) {
      const elegido = potreroPorId(ctx.campos, pedido.potreroId)
      if (!elegido) { await responder(v, v.telefono, { texto: 'Ese potrero no está disponible para tu cuenta.' }); return false }
      campo = elegido.campo
    } else if (pedido.potrero) {
      const elegido = resolverParaMostrar(pedido.potrero, ctx.campos, campo?.id ?? null)
      if ('varios' in elegido) {
        await responder(v, v.telefono, { texto: '¿De cuál campo querés el detalle?', lista: { boton: 'Elegir potrero', filas: elegido.varios.slice(0, 10).map(x => ({ id: `acercar@${x.potrero.id}`, titulo: x.potrero.nombre, detalle: x.campo.nombre })) } }); return false
      }
      if (!('ok' in elegido)) { await responder(v, v.telefono, { texto: 'No encontré ese potrero. Decime el nombre como aparece en el mapa.' }); return false }
      campo = elegido.ok.campo; focoId = elegido.ok.potrero.id
    }
    if (!campo) { if (!automatico) await responder(v, v.telefono, elegirMapa(ctx, Boolean(pedido.nombre || pedido.campoId))); return false }
    const capturaId = pendiente?.capturaId ?? null
    if (automatico && capturaId && await db.mapaEnviadoParaCaptura(v, capturaId, campo.id)) return false
    return await atenderMapa(campo, {
      datos: async id => { const datos=await db.datosMapa(v,id); return datos && ctx.pilotoHabilitado ? {...datos,alertas:await pilotoStore.potrerosConProblemas(v,id),equipos:await pilotoStore.equiposConProblemas(v,id)} : datos }, render: datos => imagenMapa(datos, ctx.hoy, fetch, focoId),
      responder: m => responder(v, v.telefono, m),
      enviarImagen: (bytes, caption, campoId) => enviarImagenMapa(v, bytes, caption, campoId, capturaId),
    }, automatico && pendiente?.tipo === 'ubicacion' ? preguntaRecorrida(pendiente,ctx) : focoId ? `Detalle de ${potreroPorId(ctx.campos, focoId)?.potrero.nombre}.` : undefined)
  } catch (e) {
    console.warn('wa-webhook: no se pudo preparar o enviar el mapa', e instanceof Error ? e.message : String(e))
    if (!automatico) await responder(v, v.telefono, { texto: 'No pude enviar el mapa ahora. Conservé tu carga pendiente; podés escribir el nombre del potrero o pedirme el mapa nuevamente.' }).catch(() => {})
    return false
  }
}

async function avanzar(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador, notasPrevias: string[], mensajeId: string = capturaId, confirmaSeleccion = false): Promise<void> {
  // Toda carga pasa por acá: lo no habilitado no se propone (permisos, 13/11).
  const habilitado = permiso(ctx.niveles ?? null, b.tipo)
  if (!habilitado.ok) {
    await db.actualizarCaptura(capturaId, { estado: 'respondida', notas: ['No habilitado para quien escribe.'] })
    await db.guardarPendiente(v.id, null)
    await responder(v, v.telefono, { texto: habilitado.texto })
    return
  }
  const paso: Paso = siguientePaso(capturaId, b, ctx)
  const notas = [...notasPrevias, ...paso.notas]
  const to = v.telefono
  if (confirmaSeleccion && paso.k==='proponer' && b.tipo==='recorrida' && !b.sesionId) {
    await db.actualizarCaptura(capturaId,{estado:'propuesta',propuesta:paso.borrador,notas})
    await db.guardarPendiente(v.id,paso.pendiente)
    await confirmar(v,ctx,capturaId,paso.borrador,paso.pendiente)
    return
  }
  if (ctx.pilotoHabilitado && b.sesionId && !b.cerrarSesion) {
    const s=await pilotoStore.sesionActiva(v)
    if (!s || s.id!==b.sesionId) throw new EntradaIncompleta('La sesión cambió. Escribí «retomar recorrida» antes de seguir.')
    const borrador=paso.k==='proponer' ? fusionarRecorrida({...paso.borrador,observaciones:[]},paso.borrador) : paso.k==='preguntar' && paso.pendiente.tipo!=='ubicado' ? paso.pendiente.borrador : b
    if (borrador.observaciones?.some(o=>o.campoId && o.campoId!==s.campo_id)) throw new EntradaIncompleta('Ese potrero pertenece a otro campo. Conservé la sesión sin agregar este mensaje.')
    if (!await pilotoStore.guardarSesion(v,s,borrador,mensajeId)) { await responder(v,to,{texto:'Ese mensaje ya se sumó o la sesión cambió. No lo agregué otra vez.'}); return }
    if (paso.k==='proponer') {
      await db.guardarPendiente(v.id,null)
      await db.actualizarCaptura(capturaId,{estado:'respondida',propuesta:borrador})
      await responder(v,to,{texto:`El borrador reúne ${borrador.observaciones?.length ?? 0} observaciones del ${s.fecha}. Podés seguir con otro audio o «cerrar recorrida» para revisar y confirmar. Todavía no registré la recorrida.`})
      return
    }
  }
  switch (paso.k) {
    case 'preguntar':
      if (paso.pendiente.tipo === 'campo' && paso.pendiente.confirmaAlElegir) {
        // La pregunta ya es una propuesta: la elección será su confirmación.
        await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: paso.pendiente.borrador, notas })
      }
      await db.guardarPendiente(v.id, paso.pendiente)
      if (!(paso.pendiente.tipo === 'campo' && paso.pendiente.confirmaAlElegir))
        await db.actualizarCaptura(capturaId, { notas })
      if (paso.pendiente.tipo === 'ubicacion' && await mostrarMapa(v, ctx, paso.pendiente, {}, true)) return
      await responder(v, to, paso.mensaje)
      if (paso.pendiente.tipo === 'potrero') {
        if (!(await mostrarMapa(v, ctx, paso.pendiente, {}, true)))
          await responder(v, to, { texto: 'Para reconocer los potreros, podés pedirme «mapa». Tu audio se conserva.', botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }] })
      }
      return
    case 'proponer': {
      const revision = crypto.randomUUID()
      await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: paso.borrador, notas })
      await db.guardarPendiente(v.id, { ...paso.pendiente, revision })
      const reporte = paso.borrador.mortandad
      const aviso = reporte ? `\n\n${reporte.detalle ? reporte.detalle.replace(/[.]+$/g, '') + '. ' : ''}También me contaste que murieron *${resumenMortandad(reporte)}*. Revisamos la mortandad después de la lluvia.` : ''
      await responder(v, to, {
        ...paso.mensaje,
        texto: paso.mensaje.texto + aviso,
        botones: paso.mensaje.botones?.map(boton => ({ ...boton, id: boton.id + '=' + revision })),
      })
      return
    }
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

const ACLARAR_CONSULTA_AUDIO = 'No me quedó clara la pregunta. ¿Me la repetís en otro audio o por texto?'

async function pausarRecorridaNegada(v: db.Vinculo, pendiente: Pendiente | null, texto: string): Promise<string> {
  if (pendiente?.tipo !== 'propuesta' || pendiente.borrador.tipo !== 'recorrida' || !niegaRecorrida(texto)) return ''
  await db.guardarPendiente(v.id, { ...pendiente, tipo: 'corregir' })
  return '\n\nDejé la recorrida pendiente de revisar. Escribí «retomar recorrida» si querés volver a verla.'
}

async function responderConsulta(v: db.Vinculo, ctx: Contexto, capturaId: string, consulta: ReturnType<typeof arrancar>): Promise<string> {
  if ('respuesta' in consulta) return consulta.respuesta
  const paso = siguientePaso(capturaId, consulta.borrador, ctx)
  if (paso.k === 'consultar') return await consultar(v, ctx, paso.borrador)
  if (paso.k === 'decir') return paso.mensaje.texto
  return 'Decime qué dato querés consultar y en qué campo.'
}

async function consultar(v: db.Vinculo, ctx: Contexto, b: Borrador): Promise<string> {
  // Toda consulta pasa por acá (sola, corregida o dentro de un mensaje con varios pedidos).
  const habilitado = permiso(ctx.niveles ?? null, b.tipo)
  if (!habilitado.ok) return habilitado.texto
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
    case 'consulta_hacienda': {
      const filas = await db.hacienda(v, b)
      if (!b.categoriaAnimal) return R.hacienda(filas, { campo: potrero?.campo.nombre ?? campo?.nombre, potrero: potrero?.potrero.nombre })
      const cantidad = filas.filter(f => f.categoria === b.categoriaAnimal).reduce((total, f) => total + f.cabezas, 0)
      const donde = potrero ? `en el ${potrero.potrero.nombre} de ${potrero.campo.nombre}` : campo ? `en ${campo.nombre}` : 'en tus campos'
      return `Hoy ${cantidad === 1 ? 'figura' : 'figuran'} *${cantidad} ${plural(b.categoriaAnimal, cantidad)}* ${donde}.`
    }
    case 'consulta_lluvia': {
      const dia = esFecha(b.fecha) ? b.fecha : null
      const referencia = ctx.fechaMensaje ?? ctx.hoy
      const lunes = inicioSemana(referencia)
      const semana = b.semanaPasada || b.periodo === 'semana'
      const desde = b.semanaPasada ? sumarDias(lunes, -7) : semana ? lunes : dia ?? `${referencia.slice(0, 7)}-01`
      const hasta = b.semanaPasada ? sumarDias(lunes, -1) : semana ? referencia : dia ?? referencia
      if (desde > hasta || hasta > ctx.hoy) return '¿Qué día pasado querés consultar?'
      const porFuente = await db.lluviaPeriodo(v, b.campoId ?? null, desde, hasta)
      const alcance = potrero ? `El ${potrero.potrero.nombre} está en ${potrero.campo.nombre}. La lluvia se registra por campo.\n\n` : ''
      if (semana) return alcance + R.lluviaPorPeriodo(desde, hasta, porFuente)
      const filas = await db.lluviaMes(v, b.campoId ?? null, dia ?? ctx.hoy, Boolean(dia))
      return alcance + R.lluviaConsulta(ctx.hoy, filas.map((f) => ({
        campo: f.campo, mesMm: f.mes_mediciones ? f.mes_mm : null, anteriorMm: dia ? null : f.ant_mm,
      })), dia) + R.estimacionesLluvia(porFuente)
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

async function confirmar(
  v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador, pendiente: Pendiente | null,
  compuesto?: { estado: PendienteTurno; siguiente: db.Vinculo['pendiente'] },
): Promise<EstadoCarga | null> {
  const to = v.telefono
  const siguiente: PendienteMortandad | null = b.tipo === 'lluvia' && b.mortandad
    ? { tipo: 'mortandad', capturaId: null, reporte: b.mortandad }
    : null
  // La toma comprueba la versión y conserva la mortandad como revisión independiente.
  if (!pendiente || !(await db.tomarPropuesta(v, capturaId, compuesto?.estado ?? pendiente, compuesto ? compuesto.siguiente : siguiente))) {
    const guardada = await db.verificarCargaDeCaptura(v, capturaId).catch(() => null)
    await responder(v, to, {
      texto: guardada === true
        ? 'Esa carga ya está guardada. No la cargué otra vez.'
        : 'Esa confirmación ya se está procesando o no está disponible. No volví a cargarla.',
    })
    return null
  }

  if (b.tipo === 'recorrida') return await confirmarRecorrida(v, ctx, capturaId, b)
  if (b.tipo !== 'lluvia' && b.tipo !== 'gasto') return null
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
  // Lo que adelantó un invitado o hay que pagar: se dice a dónde fue (la Agenda del dueño).
  const guardada = lluvia
    ? R.lluviaAnotada(lluvia)
    : `${b.pago && b.pago !== 'campo' ? `Listo, anoté *${R.pesosTexto(gasto.monto)}* de ${gasto.categoria} en ${campo}: ${comoSePaga(b, ctx)}. Lo ve el dueño en su Agenda.` : R.gastoAnotado(gasto)}${fotoFalto}`
  const resultado = await confirmarConVerificacion({
    escribir: () => b.tipo === 'lluvia' ? db.escribirLluvia(v, b, id) : db.escribirGasto(v, b, url, id, ctx.nombre),
    verificar: () => db.verificarCarga(v, tabla, id),
    mensajeGuardada: guardada,
    resumir: async () => {
      // A quien sólo manda no se le muestran totales (permisos, 13/11): la confirmación de lo suyo y nada más.
      if (soloManda(ctx.niveles ?? null, lluvia ? 'campos' : 'plata') || (b.pago && b.pago !== 'campo'))
        return guardada
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
  let texto = resultado.texto
  if (siguiente) {
    if (resultado.estado === 'guardada' && lluvia) texto = R.lluviaAnotada(lluvia)
    const revision = await textoRevisionMortandad(v, ctx, siguiente.reporte).catch(e => {
      console.error('wa-webhook revisar mortandad', e)
      return 'La revisión de Hacienda quedó pendiente. Escribí «revisar mortandad» para reintentar.'
    })
    texto += `\n\n${revision}`
  }
  // Un fallo de registro técnico o de envío no cambia una escritura ya confirmada.
  await responder(v, to, { texto }).catch((e) => console.error('wa-webhook enviar confirmación', e))
  return resultado.estado
}

async function foto(
  v: db.Vinculo,
  ctx: Contexto & { categoriasOcr: { id: string; nombre: string; grupo: string | null; aplica_a: string | null }[] },
  capturaId: string,
  img: NonNullable<MensajeMeta['image']>,
  capturaAnterior?: string | null,
  compuesto?: { turno: PendienteTurno; io: IOCompuesto },
): Promise<void> {
  const to = v.telefono
  const f = await meta.descargarMedia(img.id)
  const c = await leerComprobante(f.bytes, f.mime, ctx.categoriasOcr)
  await db.actualizarCaptura(capturaId, { interpretacion: c, interpretadoPor: 'extraer-comprobante' })
  // Un invitado con una foto que no se lee: no se adivina; se le pregunta el monto y la foto
  // queda con el gasto, para que el dueño la revise (llega como «Nuevo») (permisos, 14/11).
  if (!c.monto && ctx.niveles && permiso(ctx.niveles, 'gasto').ok) {
    await db.actualizarCaptura(capturaId, { notas: ['La foto no se leyó: el monto lo dice quien la mandó.'] })
    await avanzar(v, ctx, capturaId, { tipo: 'gasto', monto: null, fecha: null, campoMencion: img.caption ?? null, fotoMediaId: img.id, descripcion: 'Comprobante sin leer: revisar la foto' }, [])
    return
  }
  if (!c.monto) {
    await db.actualizarCaptura(capturaId, { estado: 'error', notas: ['La foto no se leyó como comprobante.'] })
    await responder(v, to, { texto: 'No pude leer eso como un ticket o factura. ¿Me mandás otra foto, de frente y con luz?' })
    return
  }
  if (c.tipo === 'ingreso') {
    await db.actualizarCaptura(capturaId, { estado: 'descartada', notas: ['El comprobante parece un ingreso: por ahora sólo gastos.'] })
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
  if (compuesto) {
    await incorporarTurno(v, ctx, compuesto.turno, [{ capturaId, borrador }], notas, compuesto.io)
    return
  }
  if (capturaAnterior) await abandonar(capturaAnterior)
  await avanzar(v, ctx, capturaId, borrador, notas)
}

/** La recorrida: todas las observaciones del mensaje en una transacción, con ids elegidos antes. */
async function confirmarRecorrida(v: db.Vinculo, ctx: Contexto, capturaId: string, b: Borrador): Promise<EstadoCarga> {
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
  if (resultado.estado==='guardada' && b.sesionId && ctx.pilotoHabilitado) await pilotoStore.estadoSesion(v,b.sesionId,'cerrada').catch(e=>console.error('Cerrar sesión',e))
  await responder(v, v.telefono, { texto: resultado.texto }).catch((e) => console.error('wa-webhook enviar recorrida', e))
  return resultado.estado
}

/**
 * Compartió la ubicación. Si el bot la pidió para una recorrida, completa el
 * potrero de lo que dijo "acá"; si no, la guarda para el próximo mensaje.
 */
async function enviarImagenMapa(v: db.Vinculo, bytes: Uint8Array, caption: string, campoId: string, capturaId: string | null): Promise<void> {
  const mediaId = await meta.subirImagen(bytes, bytes[0] === 255 ? 'troppero-mapa.jpg' : 'troppero-mapa.png')
  const r = await meta.enviarImagen(v.telefono, mediaId, caption)
  await db.guardarSaliente({ wamid: r.wamid, telefono: v.telefono, vinculo: v, cuerpo: { ...r.cuerpo, tropero_mapa: { campo_id: campoId, captura_id: capturaId } } })
}

async function ubicacion(
  v: db.Vinculo, ctx: Contexto, pendiente: Pendiente | null, loc: { latitude: number; longitude: number },
  compuesto?: { turno: PendienteTurno; io: IOCompuesto },
): Promise<void> {
  const to = v.telefono
  if (compuesto && pendiente?.tipo !== 'ubicacion') {
    await responder(v, to, { texto: 'La carga abierta sigue pendiente. Si la ubicación corresponde a otro pendiente, escribí «siguiente pendiente» para mostrarlo.' })
    return
  }
  const dibujados = await db.potrerosDibujados(v)
  const p = potreroEnPunto(loc.latitude, loc.longitude, dibujados)
  if (pendiente?.tipo === 'ubicacion') {
    if (!p) {
      await responder(v, to, { texto: 'Esa ubicación no cae dentro de ningún potrero dibujado. Escribime el número del potrero.' })
      return
    }
    const u = { potreroId: p.id, campoId: p.campoId }
    const borrador = conUbicacion(pendiente.borrador, u, pendiente.obsIndex)
    if (compuesto) await actualizarPasoTurno(v, ctx, compuesto.turno, { capturaId: pendiente.capturaId, borrador }, compuesto.io)
    else await avanzar(v, ctx, pendiente.capturaId, borrador, [`Ubicación: ${p.nombre} de ${p.campo}.`])
    return
  }
  if (pendiente?.capturaId) await abandonar(pendiente.capturaId)
  const punto: [number, number] = [loc.latitude, loc.longitude]
  if (!p) {
    // Fuera de los potreros (el casco, la calle): igual se puede cargar algo ahí.
    const cerca = potreroCercano(punto, dibujados)
    if (cerca) {
      await db.guardarPendiente(v.id, { tipo: 'infra', capturaId: null, paso: 'tipo', punto, campoId: cerca.campoId })
      await responder(v, to, ofrecerCarga(`Esa ubicación no cae dentro de un potrero; está cerca del *${cerca.nombre}* de ${cerca.campo}. Si querés cargar algo que está ahí, elegí qué es o escribilo («tanque australiano»).`))
      return
    }
    await db.guardarPendiente(v.id, null)
    await responder(v, to, { texto: 'No estás dentro de ningún potrero dibujado. Contame qué viste y en qué potrero.' })
    return
  }
  await db.guardarPendiente(v.id, { tipo: 'ubicado', capturaId: null, ubicado: { potreroId: p.id, campoId: p.campoId, punto } })
  await responder(v, to, ofrecerCarga(`Estás en el *${p.nombre}* de ${p.campo}. Contame qué ves. Si querés cargar algo que está acá, elegí qué es o escribilo («tanque australiano»).`))
}
