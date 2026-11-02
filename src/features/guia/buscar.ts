import type { Ficha } from '@/features/guia/fichas'

// Buscar entre las dudas mientras se escribe: sin IA, por palabras. Lo que está
// en la pregunta pesa más que lo que está en la respuesta.

/** Minúsculas y sin tildes: «Ubicá» y «ubica» son lo mismo. */
export function normalizar(s: string): string {
  return s.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Palabras que no dicen nada de qué se busca. */
const VACIAS = new Set(['como', 'que', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'mi', 'mis', 'me', 'y', 'o', 'a', 'al', 'se', 'lo', 'es', 'por', 'para', 'con', 'hago', 'puedo'])

export function buscarFichas(fichas: Ficha[], texto: string, max = 5): Ficha[] {
  const palabras = normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p))
  if (palabras.length === 0) return []
  // Por la raíz: «potreros» encuentra «potrero», «animales» encuentra «animal».
  const raices = palabras.map((p) => (p.length > 6 ? p.slice(0, -2) : p))
  // Tiene que coincidir al menos la mitad de lo que se escribió: si no, mejor
  // decir que no está que mostrar cualquier cosa.
  const minimo = Math.ceil(raices.length / 2)
  return fichas
    .map((f) => {
      const pregunta = normalizar(f.chip)
      const respuesta = normalizar(f.respuesta)
      let puntos = 0
      let coinciden = 0
      for (const r of raices) {
        const peso = pregunta.includes(r) ? 3 : respuesta.includes(r) ? 1 : 0
        puntos += peso
        if (peso > 0) coinciden++
      }
      return { f, puntos, coinciden }
    })
    .filter((x) => x.coinciden >= minimo)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, max)
    .map((x) => x.f)
}
