// Resolver nombres contra la base. El modelo extrae "el 5 de la porteña"; acá
// el código lo busca en los campos y potreros reales de la empresa. Si hay más
// de un candidato se devuelven todos para preguntar: nunca se adivina.

import { norm } from './texto.ts'
import type { Campo, Categoria, Potrero } from './tipos.ts'

export type Resultado<T> = { ok: T } | { varios: T[] } | { ninguno: true }

const sinArticulo = (s: string) =>
  norm(s).replace(/^(campo|establecimiento|estancia)\s+/, '').replace(/^(la|el|los|las)\s+/, '')

export function resolverCampo(mencion: string | null | undefined, campos: Campo[]): Resultado<Campo> {
  const m = sinArticulo(mencion ?? '')
  if (!m) return { ninguno: true }
  const exactos = campos.filter((c) => sinArticulo(c.nombre) === m)
  if (exactos.length === 1) return { ok: exactos[0] }
  if (m.length < 3) return { ninguno: true }
  const parecidos = campos.filter((c) => {
    const n = sinArticulo(c.nombre)
    return n.includes(m) || m.includes(n)
  })
  if (parecidos.length === 1) return { ok: parecidos[0] }
  if (parecidos.length > 1) return { varios: parecidos }
  return { ninguno: true }
}

export type PotreroDe = { campo: Campo; potrero: Potrero }

const compacto = (s: string) =>
  norm(s)
    .replace(/^(el|del|en el|potrero|lote|cuadro)\s+/g, '')
    .replace(/^(potrero|lote|cuadro)\s+/, '')
    .replace(/[\s°.#-]/g, '')

/**
 * "5B" o "potrero 5b" → ese potrero. "5" → todos los potreros que empiezan con
 * 5 (el 5B de La Porteña y el 5C de Toimil), restringidos al campo si se sabe.
 */
export function resolverPotrero(
  mencion: string | null | undefined,
  campos: Campo[],
  campoId?: string | null,
): Resultado<PotreroDe> {
  const m = compacto(mencion ?? '')
  if (!m) return { ninguno: true }
  const todos: PotreroDe[] = campos
    .filter((c) => !campoId || c.id === campoId)
    .flatMap((c) => c.potreros.map((p) => ({ campo: c, potrero: p })))

  const exactos = todos.filter((x) => compacto(x.potrero.nombre) === m)
  if (exactos.length === 1) return { ok: exactos[0] }
  if (exactos.length > 1) return { varios: exactos }

  if (/^\d+$/.test(m)) {
    const porNumero = todos.filter((x) => (compacto(x.potrero.nombre).match(/^\d+/)?.[0] ?? '') === m)
    if (porNumero.length === 1) return { ok: porNumero[0] }
    if (porNumero.length > 1) return { varios: porNumero }
  }
  return { ninguno: true }
}

export function resolverCategoria(mencion: string | null | undefined, cats: Categoria[]): Categoria | null {
  const m = norm(mencion ?? '')
  if (!m) return null
  return (
    cats.find((c) => norm(c.nombre) === m) ??
    cats.find((c) => norm(c.nombre).split(/\s*\/\s*/).some((parte) => parte === m || parte.startsWith(m))) ??
    null
  )
}

export function campoPorId(campos: Campo[], id: string | null | undefined): Campo | null {
  return campos.find((c) => c.id === id) ?? null
}

export function potreroPorId(campos: Campo[], id: string | null | undefined): PotreroDe | null {
  for (const c of campos) {
    const p = c.potreros.find((x) => x.id === id)
    if (p) return { campo: c, potrero: p }
  }
  return null
}
