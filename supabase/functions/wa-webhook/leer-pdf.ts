import { extractTextItems, getDocumentProxy } from 'npm:unpdf@2.1.0'
import { fechaDocumento, interpretarDocumentoVeterinario, mostrarProtocolo, pesos, resumenDocumento, type LecturaDocumentoVeterinario } from '../_shared/wa/documento-veterinario.ts'
import { noHabilitado, tieneSeccion, type Niveles } from '../_shared/wa/permisos.ts'
import { descargarMedia } from './meta.ts'
import { redactarLecturaPdf } from './llm.ts'

export async function leerPdfVeterinario(bytes: Uint8Array): Promise<LecturaDocumentoVeterinario> {
  const pdf = await getDocumentProxy(bytes.slice(), { useSystemFonts: false, maxImageSize: 4_000_000 })
  try {
    if (pdf.numPages < 1 || pdf.numPages > 3) return null
    const { items } = await extractTextItems(pdf)
    return interpretarDocumentoVeterinario(items.map(pagina => {
      const filas: (typeof pagina)[] = []
      for (const item of pagina.filter(i => i.str.trim()).sort((a, b) => b.y - a.y)) {
        const fila = filas.at(-1)
        if (fila && fila[0].y - item.y <= 2) fila.push(item)
        else filas.push([item])
      }
      return filas.map(fila => fila.sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ')).join('\n')
    }))
  } finally {
    await pdf.loadingTask?.destroy?.()
  }
}

export async function descargarPdfVeterinario(mediaId: string) {
  const { bytes, mime } = await descargarMedia(mediaId, 5 * 1024 * 1024)
  if (mime.split(';')[0].trim().toLowerCase() !== 'application/pdf'
    || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('El archivo no es un PDF')
  return { bytes, doc: await leerPdfVeterinario(bytes) }
}

export function mensajeTotalesEnConflicto(totales: number[]): string {
  const importes = totales.slice(0, 4).map(pesos)
  const lista = new Intl.ListFormat('es-AR').format(importes)
  const otros = totales.length > importes.length ? ' y otros importes' : ''
  return `Encontré más de un total en el PDF: ${lista}${otros}. ¿Podés revisar el comprobante y reenviarme la versión correcta? Dejé la factura sin guardar.`
}

const ARCHIVO_NO_HABILITADO = 'El archivo de documentos todavía no está habilitado para tu cuenta, así que el PDF quedó sin guardar.'

type ContextoPdf = {
  mensaje?: string
  /** Lo que el dueño le habilitó; null = el dueño. Sin dato, no se filtra. */
  niveles?: Niveles
  guardar?: boolean
  lectura?: Promise<Awaited<ReturnType<typeof descargarPdfVeterinario>>>
}

async function responderLectura(doc: NonNullable<LecturaDocumentoVeterinario>, contexto: ContextoPdf): Promise<string> {
  const estado = contexto.guardar
    ? ARCHIVO_NO_HABILITADO
    : 'Por ahora solo revisé el PDF.'
  const resumen = doc.tipo === 'totales_en_conflicto' ? mensajeTotalesEnConflicto(doc.totales) : resumenDocumento(doc)
  const respaldo = doc.tipo === 'totales_en_conflicto' && !contexto.guardar ? resumen : resumen + '\n\n' + estado
  if (doc.tipo === 'totales_en_conflicto') return respaldo
  const campos: Record<string, string> = { ESTADO: estado }
  let claves: string[]
  if (doc.tipo === 'factura') {
    Object.assign(campos, { FACTURA: doc.numero, FECHA: fechaDocumento(doc.fecha), TOTAL: pesos(doc.total) })
    if (doc.emisor) campos.EMISOR = doc.emisor
    claves = ['TOTAL']
  } else if (doc.tipo === 'protocolo') {
    Object.assign(campos, {
      PROTOCOLO: mostrarProtocolo(doc.protocolo), FECHA: fechaDocumento(doc.fecha),
      ANIMALES: doc.cantidad + ' ' + doc.categoria, RESULTADOS: doc.resumen,
    })
    claves = ['PROTOCOLO', 'ANIMALES']
  } else {
    campos.RESUMEN = resumen
    claves = ['RESUMEN']
  }
  claves.push('ESTADO')
  const envolver = (k: string) => '[[' + k + ']]'
  const texto = await redactarLecturaPdf(contexto.mensaje ?? '', doc.tipo, Object.keys(campos).map(envolver), claves.map(envolver))
    .catch(() => null)
  if (!texto || texto.length > 500 || !texto.endsWith('\n[[ESTADO]]') || claves.some(k => !texto.includes(envolver(k)))) return respaldo
  const usados = [...texto.matchAll(/\[\[([A-Z]+)\]\]/g)].map(m => m[1])
  const prosa = texto.replace(/\[\[[A-Z]+\]\]/g, '')
  if (!prosa.trim() || /[\d$€<>{}\[\]]/.test(prosa)
    || /\b(?:[a-záéíóú]*guard[a-záéíóú]*|registr[a-záéíóú]*|carg[a-záéíóú]*|pag[a-záéíóú]*|transfer[a-záéíóú]*|venc[a-záéíóú]*)\b/i.test(prosa)
    || usados.some(k => !Object.hasOwn(campos, k)) || usados.length !== new Set(usados).size) return respaldo
  return texto.replace(/\[\[([A-Z]+)\]\]/g, (_, k: string) => campos[k])
}

export function seccionDelPdf(doc: NonNullable<LecturaDocumentoVeterinario>) {
  return doc.tipo === 'factura' || doc.tipo === 'totales_en_conflicto' ? 'plata' : 'hacienda'
}

export async function responderPdf(mediaId: string, contexto?: ContextoPdf): Promise<string> {
  try {
    const { doc } = await (contexto?.lectura ?? descargarPdfVeterinario(mediaId))
    if (!doc && contexto?.guardar) return ARCHIVO_NO_HABILITADO
    if (!doc) return 'Abrí el PDF, pero no pude leer los datos del comprobante con seguridad. Si es un escaneo, ¿me mandás una foto de la página donde se ve el total?'
    const seccion = seccionDelPdf(doc)
    if (contexto?.niveles !== undefined && !tieneSeccion(contexto.niveles, seccion)) {
      return noHabilitado(contexto.niveles, seccion, 'ver')
    }
    if (contexto?.mensaje !== undefined) return await responderLectura(doc, contexto)
    if (doc.tipo === 'totales_en_conflicto') return mensajeTotalesEnConflicto(doc.totales)
    return resumenDocumento(doc) + (doc.tipo === 'factura' ? '\n\nTodavía no registré ningún gasto.' : '')
  } catch (e) {
    console.error('wa-webhook leer PDF', e instanceof Error ? e.message : String(e))
    if (contexto?.guardar) return ARCHIVO_NO_HABILITADO
    return 'No pude abrir el PDF. ¿Me reenviás el archivo original o una foto de la factura?'
  }
}
