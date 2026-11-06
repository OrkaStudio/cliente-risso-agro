/** Palabras que en un nombre van en minúscula salvo al principio («Juan de la Torre»). */
const CHICAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'van', 'von'])

/**
 * Un nombre propio mientras se escribe: mayúscula al principio de cada palabra
 * («francisco lerra» → «Francisco Lerra»). No toca el resto de lo que escribió.
 */
export function nombrePropio(s: string): string {
  return s.replace(/(^|[\s'-])(\p{L})(\p{L}*)/gu, (_todo, sep: string, l: string, resto: string, i: number) => {
    const palabra = (l + resto).toLowerCase()
    if (i > 0 && CHICAS.has(palabra)) return sep + palabra
    return sep + l.toUpperCase() + resto
  })
}

/** Sólo la primera letra en mayúscula («contador de la empresa» → «Contador de la empresa»). */
export function primeraMayuscula(s: string): string {
  return s.replace(/^(\s*)(\p{L})/u, (_, esp: string, l: string) => esp + l.toUpperCase())
}
