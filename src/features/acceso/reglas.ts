// Reglas de Acceso (spec «Tropero para código», sección 1). Sin React ni red:
// se prueban solas en reglas.test.ts.

/** El código vence a los 10 minutos de mandado. */
export const VENCE_MS = 10 * 60 * 1000
/** Se puede pedir otro a los 60 segundos. */
export const REENVIO_MS = 60 * 1000
/** Con 3 intentos fallidos el código se invalida. */
export const INTENTOS = 3

/** El número de Tropero en WhatsApp (el del bot), para «Abrir WhatsApp». */
export const WHATSAPP_TROPERO = '5492244472369'

export type EstadoCodigo =
  | { tipo: 'esperando'; quedan: number }
  | { tipo: 'incorrecto'; quedan: number }
  | { tipo: 'vencido'; motivo: 'tiempo' | 'intentos' }

/** Estado del código según cuándo se mandó y cuántas veces se erró. */
export function estadoDelCodigo(
  enviadoMs: number,
  fallidos: number,
  ahoraMs: number,
): EstadoCodigo {
  if (ahoraMs - enviadoMs >= VENCE_MS) return { tipo: 'vencido', motivo: 'tiempo' }
  if (fallidos >= INTENTOS) return { tipo: 'vencido', motivo: 'intentos' }
  const quedan = INTENTOS - fallidos
  return fallidos > 0 ? { tipo: 'incorrecto', quedan } : { tipo: 'esperando', quedan }
}

/** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
export function segundosParaReenviar(enviadoMs: number, ahoraMs: number): number {
  return Math.max(0, Math.ceil((enviadoMs + REENVIO_MS - ahoraMs) / 1000))
}

/** 42 → «0:42». */
export function relojMinutos(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Busca los 6 números del código en lo que el usuario pegó: el código solo
 * («482913», «482 913») o el mensaje entero de WhatsApp («482 913 es tu código
 * para entrar a Tropero…»). Si no hay exactamente un código, null.
 */
export function codigoDeLoPegado(texto: string): string | null {
  const juntos = texto.replace(/(\d)[\s-](?=\d)/g, '$1')
  const encontrados = juntos.match(/(?<!\d)\d{6}(?!\d)/g)
  if (!encontrados || encontrados.length !== 1) return null
  return encontrados[0]
}

/** Lo que se tipea en el campo del código: sólo números, hasta 6. */
export function limpiarCodigo(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 6)
}

/** «482913» → «482 913», como se ve en el Figma. */
export function mostrarCodigo(codigo: string): string {
  return codigo.length > 3 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo
}

export type ErrorAlPedir =
  | { tipo: 'sin-cuenta' }
  | { tipo: 'sin-senal' }
  | { tipo: 'esperar'; segundos: number }
  | { tipo: 'otro'; mensaje: string }

/** Traduce el error de Supabase Auth al pedir el código a un estado del Figma. */
export function errorAlPedir(error: {
  code?: string
  status?: number
  message?: string
  name?: string
}): ErrorAlPedir {
  const msg = (error.message ?? '').toLowerCase()
  if (error.code === 'otp_disabled' || msg.includes('signups not allowed'))
    return { tipo: 'sin-cuenta' }
  if (error.code === 'over_sms_send_rate_limit' || error.status === 429) {
    const seg = Number(/after (\d+) seconds/.exec(error.message ?? '')?.[1] ?? 60)
    return { tipo: 'esperar', segundos: seg }
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    msg.includes('failed to fetch') ||
    msg.includes('network')
  )
    return { tipo: 'sin-senal' }
  return {
    tipo: 'otro',
    mensaje: 'No pudimos mandar el código. Probá de nuevo en un rato.',
  }
}

/** Un mail opcional: vacío vale; si se escribe, tiene que parecer un mail. */
export function mailValido(mail: string): boolean {
  const m = mail.trim()
  return m === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)
}

/** «Daniel Risso» → nombre «Daniel», apellido «Risso» (el celular pide uno solo). */
export function separarNombre(completo: string): { nombre: string; apellido: string } {
  const partes = completo.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return { nombre: partes[0] ?? '', apellido: '' }
  return { nombre: partes.slice(0, -1).join(' '), apellido: partes.at(-1)! }
}
