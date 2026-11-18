import { esFecha, nombreMes, norm, sumarDias } from './texto.ts'

export type FechaVeterinaria = { dia: string; anio: boolean }
export type PedidoVeterinario = {
  tipo: 'facturas' | 'muestras' | 'resumen'
  fecha: FechaVeterinaria | null
  porEmision: boolean
}
export type ArchivoVeterinario = { id: string; etiqueta: string }
export type RespuestaVeterinaria = { texto: string; archivos?: ArchivoVeterinario[] }

const dias = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve treinta treinta_y_uno'.split(' ').map(d => d.replaceAll('_', ' '))
const meses = Array.from({ length: 12 }, (_, i) => nombreMes(`2026-${String(i + 1).padStart(2, '0')}-01`))
const fechaLarga = new RegExp(`\\b(\\d{1,2}|${[...dias].reverse().join('|')}|primero|un) de (${meses.join('|')})(?: (?:de|del) (\\d{4}))?\\b`, 'g')

function fechaEn(t: string, hoy: string): FechaVeterinaria | null {
  const todas: FechaVeterinaria[] = []
  const agregar = (d: string, m: string, a?: string) => {
    const dia = `${a?.length === 2 ? '20' + a : a ?? '2000'}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    todas.push({ dia, anio: Boolean(a) })
  }
  for (const [, y, m, d] of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) agregar(d, m, y)
  for (const [, d, m, y] of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g)) agregar(d, m, y)
  for (const [, d, m, y] of t.matchAll(fechaLarga)) {
    const dia = /^\d/.test(d) ? d : d === 'primero' || d === 'un' ? '1' : String(dias.indexOf(d) + 1)
    agregar(dia, String(meses.indexOf(m) + 1), y)
  }
  const relativa = /\b(anteayer|ayer|hoy)\b/g
  for (const [, palabra] of t.matchAll(relativa)) todas.push({ dia: sumarDias(hoy, palabra === 'ayer' ? -1 : palabra === 'anteayer' ? -2 : 0), anio: true })
  if (todas.length !== 1 || !esFecha(todas[0].dia)) return null
  return todas[0]
}

export function pedidoVeterinario(texto: string, hoy: string): PedidoVeterinario | null {
  const t = norm(texto)
  if (/^(?:registra|anota|carga|agenda|programa)\b/.test(t)) return null
  const factura = /\b(?:facturas?|comprobantes?)\b/.test(t)
  const muestras = /\b(?:animales|caravanas|muestras|identificadores)\b/.test(t)
  const parte = /\b(?:resumen|parte|informe|constancia|protocolo|visita)\b/.test(t) || /\b(?:que (?:se hizo|hizo|hicieron|les aplicaron))\b/.test(t)
  const veterinaria = /\b(?:veterinari[oa]s?|serologia|sangrados?|vacunacion|vacunas?|brucelosis|tacto|protocolo)\b/.test(t)
  if (!(veterinaria && (factura || muestras || parte))) return null
  return {
    tipo: factura ? 'facturas' : muestras ? 'muestras' : 'resumen',
    fecha: fechaEn(t, hoy),
    porEmision: factura && /\b(?:emision|emitio|emitieron|emitida|emitidas|emitido|emitidos)\b/.test(t),
  }
}

export function coincideFecha(dia: string, fecha: FechaVeterinaria): boolean {
  return fecha.anio ? dia === fecha.dia : dia.slice(5) === fecha.dia.slice(5)
}
