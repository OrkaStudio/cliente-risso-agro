import { esFecha } from './texto.ts'

type Base = { fecha: string; identidad: string | null }
export type DocumentoVeterinario =
  | (Base & { tipo: 'factura'; numero: string; neto: number; total: number; referencias: string[]; emisor: string | null })
  | (Base & { tipo: 'visita'; emitido: string | null; total: number; gestacion: number; sangrados: number; km: number })
  | (Base & { tipo: 'protocolo'; protocolo: string; cantidad: number; categoria: 'vacas' | 'toros'; resumen: string; muestras: string[] })
  | (Base & { tipo: 'constancia'; protocolo: string; cantidad: number })

type TotalesEnConflicto = { tipo: 'totales_en_conflicto'; totales: number[] }
export type LecturaDocumentoVeterinario = DocumentoVeterinario | TotalesEnConflicto | null

export const documentoLabel: Record<DocumentoVeterinario['tipo'], string> = {
  factura: 'Factura', visita: 'Detalle de visita', protocolo: 'Protocolo de laboratorio', constancia: 'Constancia de serología',
}

const textoSinAcentos = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '')
const fechaNumero = '(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})'
function fechaDe(s: string | undefined): string | null {
  if (!s) return null
  const [dia, mes, anio] = s.split(/[/-]/)
  const iso = `${anio.length === 2 ? '20' + anio : anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  return esFecha(iso) ? iso : null
}

function centavos(s: string | undefined): number | null {
  const match = s?.match(/^(\d+(?:[.,]\d{3})*)[.,](\d{2})$/)
  if (!match) return null
  const resultado = Number(match[1].replace(/[.,]/g, '') + match[2])
  return Number.isSafeInteger(resultado) && resultado > 0 ? resultado : null
}

function leerFactura(t: string): LecturaDocumentoVeterinario {
  const codigo = t.match(/^cod\.?[ \t]*0*(\d{1,2})[ \t]*$/im)?.[1]
  // Al extraer filas del PDF, el nombre del emisor y el título pueden quedar juntos.
  if (!codigo || !/(?:^|[ \t])factura(?:[ \t]+[abcm])?[ \t]*$/im.test(t)
    || /(?:^|[ \t])nota[ \t]+de[ \t]+(?:credito|debito)\b/im.test(t)) return null
  const numeroEtiqueta = '(?:comp\\.\\s*nro|nro|numero de comprobante)\\.?[ \\t]*:[ \\t]*'
  const compuesto = t.match(new RegExp('\\b' + numeroEtiqueta + '(\\d{1,5})-(\\d{1,8})\\b', 'i'))
  const separado = t.match(new RegExp('\\bpunto de venta:\\s*(\\d{1,5})\\s+' + numeroEtiqueta + '(\\d{1,8})\\b', 'i'))
  const numero = compuesto ?? separado
  const cuit = t.match(/\bc\.?u\.?i\.?t\.?\s*:\s*(\d{2}-?\d{8}-?\d)\b/i)?.[1].replaceAll('-', '')
  const fecha = fechaDe(t.match(new RegExp('(?:Fecha de Emision|Fecha del Comprobante):[ \\t]*' + fechaNumero, 'i'))?.[1]
    ?? t.match(new RegExp('^Fecha:[ \\t]*' + fechaNumero + '[ \\t]*$', 'im'))?.[1])
  if (!numero || !cuit || !fecha || /\b(?:USD|U\$S|dolares)\b/i.test(t)) return null
  const importes = [...t.matchAll(/\b(importe total|total a pagar)[ \t]*:\s*(?:ARS[ \t]*\$?|\$)\s*([\d.,]+)/gi)]
  const totales = [...new Set(importes.map(m => centavos(m[2])).filter(n => n !== null))]
  if (totales.length > 1) return { tipo: 'totales_en_conflicto', totales }
  const total = centavos(importes.find(m => m[1].toLowerCase() === 'importe total')?.[2])
  const neto = centavos(t.match(/importe neto gravado:\s*\$\s*([\d.,]+)/i)?.[1])
  if (total === null || neto === null || neto > total) return null
  const fiscal = numero[1].padStart(5, '0') + '-' + numero[2].padStart(8, '0')
  const referencias = [...new Set((t.match(/\breferencia:\s*([0-9., ]+)/i)?.[1] ?? '')
    .match(/\b\d{3}\.?\d{3}\b/g)?.map(x => x.replace('.', '')) ?? [])]
  const emisor = t.match(/^razon social:[ \t]*(\S.+?)(?:[ \t]+(?:fecha(?: de emision)?|cu[.]?it|domicilio):.*)?$/im)?.[1]
    ?? t.match(/^razon social:[ \t]*\n(?:factura[ \t]+[abcm][ \t]*\n)?([^:\n]+)\n(?:[abcm][ \t]*\n)?[ \t]*domicilio:/im)?.[1]
    ?? null
  return { tipo: 'factura', identidad: `factura:${cuit}:${codigo}:${fiscal}`, fecha, numero: fiscal, neto, total, referencias, emisor: emisor?.trim().slice(0, 100) ?? null }
}

function leerVisita(t: string): DocumentoVeterinario | null {
  if (!/\bresumen de cuenta\b/i.test(t)) return null
  const g = t.match(new RegExp('^' + fechaNumero + '\\s+Diagnosticos? de gestacion\\s+(\\d+)\\s', 'im'))
  const s = t.match(/^sangrados?\s+(\d+)\s/im)
  const km = t.match(/^movilidad\s+[\d.,]+\s+(\d+)\s+\$/im)
  const fecha = fechaDe(g?.[1])
  const total = centavos(t.match(/^total\s+\$\s+([\d.,]+)\s*$/im)?.[1])
  if (!g || !s || !km || !fecha || total === null) return null
  const larga = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (\d{4})\b/i)
  const meses = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ')
  const emitido = larga ? fechaDe([larga[1], meses.indexOf(larga[2].toLowerCase()) + 1, larga[3]].join('/')) : null
  return { tipo: 'visita', fecha, identidad: null, emitido, total, gestacion: Number(g[2]), sangrados: Number(s[1]), km: Number(km[1]) }
}

function leerLaboratorio(t: string): DocumentoVeterinario | null {
  if (/constancia de registro de serologia/i.test(t)) {
    const protocolo = t.match(/\bprotocolo\s*:\s*(\d{3})\.?(\d{3})\b/i)
    const cantidad = Number(t.match(/\banalizados:\s*(\d+)/i)?.[1])
    const fecha = fechaDe(t.match(new RegExp('Fecha carga:\\s*' + fechaNumero, 'i'))?.[1])
    if (!protocolo || !fecha || !cantidad) return null
    return { tipo: 'constancia', fecha, identidad: null, protocolo: protocolo[1] + protocolo[2], cantidad }
  }
  const encabezado = t.match(/^protocolo\s*n[º°]\s*:\s*(\d{3})\.?(\d{3})\b/im)
  const cantidad = Number(t.match(/\bn[º°]\s*muestras:\s*(\d+)\b/i)?.[1])
  if (!encabezado || !cantidad) return null
  const protocolo = encabezado[1] + encabezado[2]
  const fecha = fechaDe(t.match(new RegExp('Fecha de extraccion\\s*:\\s*' + fechaNumero, 'i'))?.[1]
    ?? t.match(new RegExp('\\bFecha\\s*:\\s*' + fechaNumero, 'i'))?.[1])
  if (!fecha) return null
  if (/categoria:\s*toro\b/i.test(t)) {
    const muestras = [...t.matchAll(/^([A-Z0-9]{6,20})\s+(NEGATIVO|POSITIVO)\s+[….\s]+\s+(NEGATIVO|POSITIVO)\s+[….\s]+\s+(NEGATIVO|POSITIVO)\s*$/gim)]
      .map(m => `${m[1]} · Trichomoniasis (cultivo): ${m[2]} · Campylobacteriosis (IFD): ${m[3]} · Brucelosis: ${m[4]}`)
    if (muestras.length !== cantidad || new Set(muestras.map(m => m.split(' · ')[0])).size !== cantidad) return null
    return { tipo: 'protocolo', fecha, identidad: null, protocolo, cantidad, categoria: 'toros', muestras,
      resumen: 'Resultados por muestra para trichomoniasis, campylobacteriosis y brucelosis. Las columnas de q-PCR vienen sin resultado.' }
  }
  const resumen = t.match(/muestras positivas:\s*(\d+)\s+muestras negativas:\s*(\d+)\s+muestras sospechosas:\s*(\d+)/i)
  if (!resumen || resumen.slice(1).reduce((n, x) => n + Number(x), 0) !== cantidad) return null
  const resultados: Record<string, string> = { N: 'negativo', P: 'positivo', S: 'sospechoso' }
  const filas = [...t.matchAll(/\b(\d{3})[ \t]*(\d{12})[ \t]+VC[ \t]+([NPS])\b/g)]
  const muestras = new Set(filas.map(m => m[1] + m[2])).size === cantidad && filas.length === cantidad
    ? filas.map(m => m[1] + m[2] + ' · ' + resultados[m[3]]) : []
  return { tipo: 'protocolo', fecha, identidad: null, protocolo, cantidad, categoria: 'vacas', muestras,
    resumen: `Brucelosis: ${resumen[2]} negativas, ${resumen[1]} positivas, ${resumen[3]} sospechosas.` }
}

export function interpretarDocumentoVeterinario(paginas: string[]): LecturaDocumentoVeterinario {
  const docs = paginas.map(p => {
    const t = textoSinAcentos(p)
    return leerFactura(t) ?? leerVisita(t) ?? leerLaboratorio(t)
  })
  const conflicto = docs.find(d => d?.tipo === 'totales_en_conflicto')
  if (conflicto) return conflicto
  const primero = docs[0]
  if (!primero) return null
  // Un archivo de varias páginas se admite cuando todas son copias de la misma factura.
  if (docs.length > 1) {
    if (primero.tipo !== 'factura' || !docs.every((d): d is Extract<DocumentoVeterinario, { tipo: 'factura' }> =>
      d?.tipo === 'factura' && d.identidad === primero.identidad)) return null
    const totales = [...new Set(docs.map(d => d.total))]
    if (totales.length > 1) return { tipo: 'totales_en_conflicto', totales }
    if (docs.some(d => d.neto !== primero.neto)) return null
  }
  return primero
}

export const pesos = (n: number) => '$' + (n / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fechaDocumento = (d: string) => d.split('-').reverse().join('/')
export const mostrarProtocolo = (n: string) => n.slice(0, 3) + '.' + n.slice(3)

export function resumenDocumento(d: DocumentoVeterinario): string {
  switch (d.tipo) {
    case 'visita': return `Visita del ${fechaDocumento(d.fecha)}: ${d.gestacion} diagnósticos de gestación, ${d.sangrados} sangrados y ${d.km} km de traslado. Honorarios y traslado: ${pesos(d.total)}.`
    case 'factura': return `Leí la factura ${d.numero}${d.emisor ? ' de ' + d.emisor : ''}, del ${fechaDocumento(d.fecha)}, por ${pesos(d.total)}.`
    case 'protocolo': return `Protocolo ${mostrarProtocolo(d.protocolo)} · ${d.cantidad} ${d.categoria} · ${fechaDocumento(d.fecha)}. ${d.resumen}`
    case 'constancia': return `Constancia del protocolo ${mostrarProtocolo(d.protocolo)} · ${d.cantidad} muestras · registrada el ${fechaDocumento(d.fecha)}.`
  }
}
