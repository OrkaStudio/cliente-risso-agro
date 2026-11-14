/**
 * Días del calendario del productor (Argentina, UTC−3), no instantes.
 *
 * `toISOString()` pasa por UTC: de 21:00 en adelante el día allá ya cambió y
 * `new Date().toISOString().slice(0, 10)` da MAÑANA — lo anotado a la noche
 * quedaba con la fecha del día siguiente. Para un instante (created_at,
 * visto_at) UTC está bien; para un día del calendario, siempre esto.
 * Ver la lección 2026-09-risso-agro-toisostring-fechas-de-calendario.
 */

/** Date → 'YYYY-MM-DD' en hora local (nunca vía UTC). */
export function ymd(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Hoy, 'YYYY-MM-DD', en hora local. */
export function hoyLocal(): string {
  return ymd(new Date())
}

/** Dentro de `dias` días, 'YYYY-MM-DD', en hora local. */
export function enDiasLocal(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return ymd(d)
}
