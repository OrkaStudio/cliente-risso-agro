// Resolver nombres contra la base. El modelo extrae "el 5 de la porteña"; acá
// el código lo busca en los campos y potreros reales de la empresa. Si hay más
// de un candidato se devuelven todos para preguntar: nunca se adivina.

import { norm } from './texto.ts'
import type { Campo, Categoria, Potrero } from './tipos.ts'

export type Resultado<T> = { ok: T } | { varios: T[] } | { ninguno: true }

const sinArticulo = (s: string) =>
  norm(s).replace(/^(campo|establecimiento|estancia)\s+/, '').replace(/^(la|el|los|las)\s+/, '')

/** Sólo el nombre exacto: para saber si "Don Gilberto" es un campo y no a quién se le pagó. */
export function campoExacto(mencion: string | null | undefined, campos: Campo[]): Campo | null {
  const m = sinArticulo(mencion ?? '')
  if (!m) return null
  const exactos = campos.filter((c) => sinArticulo(c.nombre) === m)
  return exactos.length === 1 ? exactos[0] : null
}

/**
 * El único campo nombrado en el texto, completo y como palabras enteras. Red de
 * seguridad para cuando el modelo no completa el campo ("para el campo Toimil").
 * Si aparecen dos, no se adivina.
 */
export function campoEnTexto(texto: string, campos: Campo[]): Campo | null {
  const palabras = (x: string) => x.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const t = ` ${palabras(norm(texto))} `
  const hallados = campos.filter((c) => {
    const n = palabras(sinArticulo(c.nombre))
    return n.length >= 3 && t.includes(` ${n} `)
  })
  return hallados.length === 1 ? hallados[0] : null
}

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

/** Referencia explícita en comandos: «7B de La Porteña», sin adivinar el campo. */
export function resolverReferenciaPotrero(mencion: string, campos: Campo[], campoId?: string | null): Resultado<PotreroDe> {
  const directo = resolverPotrero(mencion, campos, campoId)
  if ('ok' in directo) return directo
  const partes = norm(mencion).match(/^(.+?) (?:de|del) (?:campo )?(.+)$/)
  if (!partes) return directo
  const campo = campoExacto(partes[2], campos)
  return campo ? resolverPotrero(partes[1], campos, campo.id) : { ninguno: true }
}

/** Para mostrar un potrero: el campo reciente desempata, pero no esconde uno que
 * sólo existe en otro campo (pedir «acercá el 12B» después de mirar Los Pampas). */
export function resolverParaMostrar(mencion: string, campos: Campo[], campoId?: string | null): Resultado<PotreroDe> {
  const r = resolverReferenciaPotrero(mencion, campos, campoId)
  return 'ninguno' in r && campoId ? resolverReferenciaPotrero(mencion, campos, null) : r
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

export type PotreroDibujado = { id: string; nombre: string; campoId: string; campo: string; poligono: [number, number][] }

/** Punto dentro de un polígono [lat, lng] (rayo horizontal). El borde cuenta como cualquiera de los dos lados. */
function adentro(lat: number, lng: number, poligono: [number, number][]): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [lati, lngi] = poligono[i]
    const [latj, lngj] = poligono[j]
    // Incluye el borde: si dos dibujos lo comparten, la resolución será ambigua.
    const cruz = (lat - lati) * (lngj - lngi) - (lng - lngi) * (latj - lati)
    if (Math.abs(cruz) < 1e-12 && lat >= Math.min(lati, latj) && lat <= Math.max(lati, latj) && lng >= Math.min(lngi, lngj) && lng <= Math.max(lngi, lngj)) return true
    if ((lati > lat) !== (latj > lat) && lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi) dentro = !dentro
  }
  return dentro
}

/**
 * En qué potrero dibujado cae la ubicación que compartió. Si cae en dos (dibujos
 * superpuestos) o en ninguno, no se adivina.
 */
export function potreroEnPunto(lat: number, lng: number, potreros: PotreroDibujado[]): PotreroDibujado | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const en = potreros.filter((p) => p.poligono.length >= 3 && p.poligono.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) && adentro(lat, lng, p.poligono))
  return en.length === 1 ? en[0] : null
}
