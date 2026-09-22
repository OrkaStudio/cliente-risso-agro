/** Nombre de pila del usuario desde `user_metadata` (lo carga el registro).
 *  `null` si no está: el asistente saluda sin nombre. */
export function nombreDe(meta: Record<string, unknown> | undefined): string | null {
  const n = meta?.nombre
  return typeof n === 'string' && n.trim() ? n.trim() : null
}
