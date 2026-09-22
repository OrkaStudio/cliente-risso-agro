import { plural, type Resumen } from '@/features/guia/estado'

/** "Hola Daniel. Risso Agro ya está: 1 campo, 8 potreros y 120 cabezas."
 *  Puro: se prueba con vitest. */
export function saludo(nombre: string | null, empresa: string | null, r: Resumen): string {
  const partes = [
    r.campos > 0 ? plural(r.campos, 'campo', 'campos') : null,
    r.potreros > 0 ? plural(r.potreros, 'potrero', 'potreros') : null,
    r.cabezas > 0 ? plural(r.cabezas, 'cabeza', 'cabezas') : null,
  ].filter((p): p is string => p !== null)
  const lista =
    partes.length > 1
      ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
      : (partes[0] ?? null)
  const hola = nombre ? `Hola, ${nombre}.` : 'Hola.'
  const quien = empresa ?? 'Tu empresa'
  return lista ? `${hola} ${quien} ya está: ${lista}.` : `${hola} ${quien} ya está.`
}
