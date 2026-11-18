/**
 * El error de una llamada a la base, como `Error`, SIN perder su código.
 *
 * Antes se hacía `throw new Error(error.message)` y se perdía el `code`: así no se podía
 * distinguir un mensaje que la base tira a propósito para el productor (RAISE → código
 * P0001, escrito en castellano: «Ya hay un potrero 4») de uno técnico. El botón muestra el
 * primero como motivo y del segundo sólo dice «No salió» (use-accion.ts, motivoDe).
 */
export function errorDeBase(error: { message: string; code?: string | null }): Error & { code?: string } {
  const e = new Error(error.message) as Error & { code?: string }
  if (error.code) e.code = error.code
  return e
}
