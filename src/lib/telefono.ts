/**
 * Celulares argentinos, escritos como los escribe la gente.
 *
 * El productor tipea "2923 456789", "02923 15-456789", "11 5555 4444" o pega
 * "+54 9 2923 45-6789" de WhatsApp. Todo eso es el MISMO número; lo que
 * guardamos es el formato internacional (E.164) que después entiende
 * WhatsApp Business / Twilio: `+549` + código de área + número, 10 dígitos
 * en total después del 9.
 *
 * Reglas AR: el 0 adelante del área y el 15 adelante del número son prefijos
 * de discado, no parte del número. El código de área tiene 2, 3 o 4 dígitos
 * (11 / 351 / 2923) y siempre empieza con 1, 2 o 3.
 */

/**
 * Códigos de área de 3 dígitos (ENACOM). El 11 es el único de 2; todo lo
 * que no está acá y no es 11 tiene 4 dígitos. Sirve para poner el guion
 * en el lugar correcto: 11-5555-4444 · 351-123-4567 · 2923-456789.
 */
const AREAS_3 = new Set([
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '264', '266',
  '280', '291', '294', '297', '298', '299', '336', '341', '342', '343', '345',
  '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381',
  '383', '385', '387', '388',
])

/** Cuántos dígitos de área tiene un número local (los 10 sin 0 ni 15). */
function largoArea(d: string): number {
  if (d.startsWith('11')) return 2
  if (AREAS_3.has(d.slice(0, 3))) return 3
  return 4
}

/**
 * Saca prefijos de discado y país, deja sólo los dígitos locales (hasta 10).
 * No valida: es el paso común entre formatear mientras escribe y normalizar.
 */
function digitosLocales(entrada: string): string {
  let d = entrada.replace(/\D/g, '')
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  // "área 15 número" (12 dígitos): sacar el 15 que sigue al código de área.
  if (d.length === 12) {
    const largo = largoArea(d)
    if (d.slice(largo, largo + 2) === '15') d = d.slice(0, largo) + d.slice(largo + 2)
  }
  return d
}

/** Devuelve el celular en E.164 (`+5492923456789`) o `null` si no es válido. */
export function normalizarCelularAR(entrada: string): string | null {
  const d = digitosLocales(entrada)
  if (d.length !== 10) return null
  if (!/^[123]/.test(d)) return null
  return `+549${d}`
}

/**
 * Formato "mientras escribe" para el input: dígitos locales con el guion
 * después de la característica (y otro en el medio para el 11 y los de 3,
 * que tienen 8 y 7 dígitos de número). Corta en 10 dígitos.
 */
export function formatearMientrasEscribe(entrada: string): string {
  const d = digitosLocales(entrada).slice(0, 10)
  if (d.length <= 2) return d
  const largo = largoArea(d)
  if (d.length <= largo) return d
  const area = d.slice(0, largo)
  const resto = d.slice(largo)
  // 11-5555-4444 y 351-123-4567 llevan un segundo guion; 2923-456789 no.
  const corte = largo === 2 ? 4 : largo === 3 ? 3 : 0
  if (corte && resto.length > corte)
    return `${area}-${resto.slice(0, corte)}-${resto.slice(corte)}`
  return `${area}-${resto}`
}

/** `+5492923456789` → `+54 9 2923-456789` (para mostrar; no se guarda así). */
export function formatearCelularAR(e164: string): string {
  const m = /^\+549(\d{10})$/.exec(e164)
  if (!m) return e164
  return `+54 9 ${formatearMientrasEscribe(m[1])}`
}
