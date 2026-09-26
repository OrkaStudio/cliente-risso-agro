// Utilidades de texto y fechas del bot de WhatsApp.
//
// Módulo puro (sin APIs de Deno): lo importan la Edge Function y los tests de
// vitest. Las fechas son strings 'YYYY-MM-DD' con aritmética en UTC: "hoy" se
// calcula en hora de Argentina y nunca con toISOString() sobre la hora local
// (lecciones/2026-09-risso-agro-toisostring-fechas-de-calendario).

const TZ = 'America/Argentina/Buenos_Aires'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Minúsculas, sin tildes ni espacios de más: para comparar lo que escribe el productor. */
export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** La fecha de hoy en Argentina, como 'YYYY-MM-DD'. */
export function hoyAR(ahora: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

function aUTC(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function sumarDias(s: string, n: number): string {
  const d = aUTC(s)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86_400_000)
}

export function esFecha(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = aUTC(s)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** '2026-09-05' → '05/09' */
export const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
export const diaSemana = (s: string) => DIAS[aUTC(s).getUTCDay()]
export const nombreMes = (s: string) => MESES[Number(s.slice(5, 7)) - 1]

/** "hoy", "ayer", "mañana" o "el vie 26/09". */
export function cuandoTexto(fecha: string, hoy: string): string {
  const n = diasEntre(hoy, fecha)
  if (n === 0) return 'hoy'
  if (n === -1) return 'ayer'
  if (n === 1) return 'mañana'
  return `el ${diaSemana(fecha).slice(0, 3)} ${ddmm(fecha)}`
}

/** $450.000 */
export function pesos(n: number): string {
  const entero = Math.round(n)
  const signo = entero < 0 ? '-' : ''
  return `${signo}$${Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/** mm con un decimal si hace falta: 22 → "22", 12.5 → "12,5" */
export function mmTexto(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/**
 * El primer número de un texto, entendiendo cómo se escribe en Argentina:
 * "80 mil" → 80000, "80k" → 80000, "$184.500" → 184500, "12,5" → 12.5.
 */
export function numeroEn(t: string): number | null {
  const m = norm(t).match(/(\d+(?:[.,]\d+)*)\s*(mil\b|k\b|lucas\b)?/)
  if (!m) return null
  let s = m[1]
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '')
  s = s.replace(',', '.')
  let v = Number(s)
  if (!Number.isFinite(v)) return null
  if (m[2]) v *= 1000
  return v
}

/** vaca → vacas, capon → capones, con n = 1 queda en singular. */
export function plural(palabra: string, n: number): string {
  if (n === 1) return palabra
  return /[aeiou]$/.test(palabra) ? `${palabra}s` : `${palabra}es`
}
