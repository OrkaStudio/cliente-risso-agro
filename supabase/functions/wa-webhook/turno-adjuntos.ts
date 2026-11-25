import type { Contexto, Mensaje, PedidoInterpretado } from '../_shared/wa/tipos.ts'
import type { MensajeReciente, Vinculo } from './db.ts'
import { tieneSeccion, veSeccion } from '../_shared/wa/permisos.ts'
import { adjuntosDelTurno, contextoDelArchivo, cruzarCaravanas, ultimaVacunacionIncompleta, type Adjunto } from './adjuntos-db.ts'
import { interpretar, type HerramientasTurno } from './llm.ts'
import type { LecturasTurno } from './lecturas-turno.ts'
import { atenderDocumentosVeterinarios } from './documentos-veterinarios.ts'
import { descargarPdfVeterinario, responderPdf, seccionDelPdf } from './leer-pdf.ts'
import { leerAdjuntoPlanilla, prepararVacunacion } from './vacunacion-planilla.ts'
import type { Planilla } from './leer-planilla.ts'

type Entrada = { id: string; texto: string; respuestaA?: string; audio: boolean }
type Responder = (mensaje: Mensaje) => Promise<void>

export async function interpretarConAdjuntos(
  v: Vinculo, ctx: Contexto, e: Entrada, responder: Responder, historial: () => Promise<MensajeReciente[]>, lecturas?: LecturasTurno,
) {
  const adjuntos = await adjuntosDelTurno(v, e.id, e.respuestaA)
  if (!adjuntos.length) return null
  const hayMuchosAdjuntos = adjuntos.length > 5
  const propio = adjuntos.find(a => a.id === e.id)
  const anterior = propio && !e.texto ? await contextoDelArchivo(v, e.id) : undefined
  const incompleta = await ultimaVacunacionIncompleta(v, adjuntos.map(a => a.id))
  const texto = e.texto || anterior?.texto || ''
  if (!texto && !propio) return null

  const datosPrevios = JSON.stringify({
    ...(anterior ? { fechaDelTexto: anterior.fecha } : {}),
    ...(incompleta ? { vacunacionEnPreparacion: {
      archivo: adjuntos.findIndex(a => a.id === incompleta.archivo) + 1,
      campo: incompleta.campo, vacuna: incompleta.vacuna, fecha: incompleta.fecha,
    } } : {}),
  })
  const planillas = new Map<string, Promise<Planilla>>()
  const planilla = (a: Adjunto) => {
    let p = planillas.get(a.id)
    if (!p) { p = leerAdjuntoPlanilla(a); planillas.set(a.id, p) }
    return p
  }
  const pdfs = new Map<string, ReturnType<typeof descargarPdfVeterinario>>()
  const pdf = (a: Adjunto) => {
    let lectura = pdfs.get(a.id)
    if (!lectura) {
      lectura = descargarPdfVeterinario(a.media)
      pdfs.set(a.id, lectura)
    }
    return lectura
  }
  const herramientas: HerramientasTurno = {
    adjuntos: adjuntos.map((a, i) => ({
      numero: i + 1, nombre: a.nombre.slice(0, 140), tipo: a.tipo,
      origen: a.id === e.id ? 'este mensaje' : e.respuestaA ? 'mensaje al que respondió'
        : a.esUltimaEntrada ? 'inmediatamente anterior' : 'reciente',
    })),
    contexto: datosPrevios,
    leer: async numero => {
      const a = adjuntos[numero - 1]
      if (a.tipo === 'pdf') {
        const { doc } = await pdf(a)
        if (doc) {
          const seccion = seccionDelPdf(doc)
          if (!tieneSeccion(ctx.niveles ?? null, seccion)) return { disponible: false }
        }
        if (doc?.tipo === 'protocolo') {
          const { muestras, ...resumen } = doc
          return { ...resumen, muestrasIdentificadas: muestras.length }
        }
        return doc
      }
      const p = await planilla(a)
      const { filas, ...datos } = p
      const cruce = veSeccion(ctx.niveles ?? null, 'hacienda') && filas.length ? await cruzarCaravanas(v, filas.map(f => f.rfid), null).catch(() => null) : null
      return {
        ...datos,
        caravanasDistintas: filas.length,
        caravanasEncontradasEnHacienda: cruce ? new Set(cruce.map(f => f.rfid)).size : null,
      }
    },
  }
  const resultado = texto ? await interpretar(texto, anterior ? { ...ctx, fechaMensaje: anterior.fecha } : ctx, undefined, true, {
    adjuntos: herramientas,
    lecturas,
    historial: e.texto ? await historial() : [],
  }).catch(e => {
    console.error('wa-webhook interpretar adjuntos', e instanceof Error ? e.message : 'error')
    return null
  }) : null
  if (!resultado && !propio) return null

  const regulares: PedidoInterpretado[] = []
  const mensajes: Mensaje[] = []
  const atendidos = new Set<string>()
  for (const p of resultado?.pedidos ?? []) {
    const it = p.interpretacion
    if (it.intent !== 'vacunacion_planilla' && it.intent !== 'revisar_pdf' && it.intent !== 'guardar_pdf') {
      if (!anterior) regulares.push(p)
      continue
    }
    const tipo = it.intent === 'vacunacion_planilla' ? 'planilla' : 'pdf'
    if (anterior && tipo !== propio?.tipo) continue
    const candidatos = adjuntos.filter(a => a.tipo === tipo)
    const indicado = it.archivo ? adjuntos[it.archivo - 1] : null
    const previo = incompleta && adjuntos.find(a => a.id === incompleta.archivo)
    const explicito = propio?.tipo === tipo ? propio : e.respuestaA ? candidatos[0] : undefined
    const a = explicito ?? (it.intent === 'guardar_pdf' ? candidatos.find(c => c.esUltimaEntrada)
      : candidatos.length === 1 && !hayMuchosAdjuntos ? candidatos[0] : undefined)
    if (!a || (it.archivo && indicado?.id !== a.id)) {
      mensajes.push({ texto: candidatos.length
        ? 'Respondé al adjunto que querés usar así tomo el correcto.'
        : 'Mandame ' + (tipo === 'planilla' ? 'el Excel o CSV que querés usar.' : 'el PDF al que te referís.') })
      continue
    }
    if (atendidos.has(a.id)) continue
    atendidos.add(a.id)
    try {
      if (tipo === 'pdf') {
        if (!await atenderDocumentosVeterinarios(v, a.id, { pdf: a.media }, async m => { mensajes.push(m) })) {
          mensajes.push({ texto: await responderPdf(a.media, { mensaje: e.texto, niveles: ctx.niveles ?? null, lectura: pdf(a), guardar: it.intent === 'guardar_pdf' }) })
        }
      } else {
        const completado = previo?.id === a.id ? {
          ...it, campo: it.campo ?? incompleta?.campo ?? null, vacuna: it.vacuna ?? incompleta?.vacuna ?? null,
          fecha: it.fecha ?? incompleta?.fecha ?? null,
        } : it
        mensajes.push(await prepararVacunacion(v, ctx, a, await planilla(a), completado, e.id, e.audio))
      }
    } catch (error) {
      console.error('wa-webhook procesar adjunto', error instanceof Error ? error.message : 'error')
      mensajes.push({ texto: 'No pude revisar ese adjunto. Probá reenviarlo como PDF, XLSX o CSV.' })
    }
  }
  // Recibir un archivo sin indicar el trabajo no se traduce en una carga.
  if (propio && !atendidos.has(propio.id) && !mensajes.length) {
    if (propio.tipo === 'pdf') {
      if (!await atenderDocumentosVeterinarios(v, propio.id, { pdf: propio.media }, async m => { mensajes.push(m) })) {
        mensajes.push({ texto: await responderPdf(propio.media, { mensaje: e.texto, niveles: ctx.niveles ?? null, lectura: pdf(propio) }) })
      }
    } else {
      try {
        const p = await planilla(propio)
        mensajes.push({ texto: p.filas.length
          ? 'Encontré ' + p.filas.length + ' caravanas en la planilla. ¿Qué trabajo querés anotar con esos animales?'
          : 'No encontré caravanas en la planilla. ¿Qué datos querés usar y en qué hoja figuran?' })
      } catch {
        mensajes.push({ texto: 'No pude abrir esa planilla. ¿Me la reenviás como XLSX o CSV?' })
      }
    }
  }
  for (const m of mensajes) await responder(m)
  const conAdjunto = mensajes.length && propio
    ? regulares.filter(p => p.interpretacion.intent !== 'saludo') : regulares
  const pedidos = mensajes.length && propio && conAdjunto.every(p => p.interpretacion.intent === 'otro' && !p.sinInterpretar)
    ? [] : conAdjunto
  return { resultado: resultado ? { ...resultado, pedidos } : null, atendido: mensajes.length > 0 }
}
