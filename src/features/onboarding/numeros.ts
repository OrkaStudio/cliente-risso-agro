/** "5000000" → "5.000.000" mientras escribe; sólo dígitos y una coma. */
export function formatearNumero(texto: string): string {
  const limpio = texto.replace(/[^\d,]/g, '')
  const [ent = '', ...resto] = limpio.split(',')
  const entero = ent.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return resto.length > 0 ? `${entero},${resto.join('').slice(0, 2)}` : entero
}

export function numeroDeFormateado(texto: string): number | null {
  const t = texto.replace(/\./g, '').replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

