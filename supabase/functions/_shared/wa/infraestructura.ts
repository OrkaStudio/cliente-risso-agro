// Inventario del campo cargado desde WhatsApp: qué es, dónde va y cómo se nombra.
// Todo puro: sin base ni red. La orquestación vive en wa-webhook/infra.ts.
import type { PotreroDibujado } from './resolver.ts'
import { norm } from './texto.ts'

export type LatLng = [number, number]
export type TipoInfra = 'molino' | 'tanque' | 'bebedero' | 'energizador' | 'tranquera' | 'electrico'
/** Lo que se ofrece al compartir una ubicación; el eléctrico se carga por borde. */
export const TIPOS_PUNTO: TipoInfra[] = ['molino', 'tanque', 'bebedero', 'tranquera', 'energizador']
export const NOMBRE_TIPO: Record<TipoInfra, string> = {
  molino: 'Molino', tanque: 'Tanque', bebedero: 'Bebedero', energizador: 'Energizador', tranquera: 'Tranquera', electrico: 'Eléctrico',
}
// Como lo dicen en el campo: el energizador es el «boyero».
const SINONIMOS: [RegExp, TipoInfra][] = [
  [/^molino/, 'molino'], [/^tanque/, 'tanque'], [/^bebedero/, 'bebedero'], [/^tranquera|^porton/, 'tranquera'],
  [/^energizador|^boyero|^pastor electrico/, 'energizador'], [/^electrico|^alambre electrico|^boyero electrico/, 'electrico'],
]
const TIPO_RE = /(molino|tanque|bebedero|tranquera|porton|energizador|boyero|pastor electrico|electrico)/
// Una observación («el tanque está vacío») no es una carga de inventario.
const ESTADO = /\b(esta|estan|no|sin|roto|rota|rompio|rompieron|vacio|vacia|seco|seca|bajo|baja|lleno|llena|cortado|cortada|anda|funciona|pierde|perdida|poca|mucha|falla|arregl\w*|tiene|hay que)\b/

function tipoDe(palabra: string): TipoInfra | null {
  return SINONIMOS.find(([re]) => re.test(palabra))?.[1] ?? null
}

/** «tanque australiano», «acá hay un molino», «boyero del casco» → tipo y apodo. */
export function elementoDeTexto(texto: string): { tipo: TipoInfra; apodo: string | null } | null {
  const original = texto.replace(/[.!?¡¿]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!original || original.length > 60) return null
  const t = norm(original).replace(/^(?:aca hay|aca esta|aca|hay|es|esto es|cargar|carga|carga[rl]?|agrega(?:r)?|anota(?:r)?|guarda(?:r)?)\s+/, '')
    .replace(/^(?:un|una|el|la)\s+/, '')
  const m = t.match(new RegExp(`^${TIPO_RE.source}\\b\\s*(.*)$`))
  if (!m) return null
  const tipo = tipoDe(m[1])
  if (!tipo || tipo === 'electrico') return null
  const resto = m[2].trim()
  if (ESTADO.test(resto)) return null
  // El apodo conserva tildes y mayúsculas tal como lo escribieron.
  const palabras = original.split(' '), cuantas = resto ? resto.split(' ').length : 0
  const apodo = cuantas ? palabras.slice(-cuantas).join(' ').replace(/^(?:de|del)\s+(?=\S)/i, m => m.toLowerCase()) : ''
  return { tipo, apodo: apodo && apodo.length <= 40 ? apodo : null }
}

// ─── Geometría en metros (proyección local; alcanza para un campo) ───
const R = 6371000, RAD = Math.PI / 180
function plano(o: LatLng) { const c = Math.cos(o[0] * RAD); return (p: LatLng): [number, number] => [(p[1] - o[1]) * RAD * R * c, (p[0] - o[0]) * RAD * R] }
export function metros(a: LatLng, b: LatLng): number { const [x, y] = plano(a)(b); return Math.hypot(x, y) }
function alSegmento(p: LatLng, a: LatLng, b: LatLng): { d: number; q: LatLng } {
  const f = plano(p), [ax, ay] = f(a), [bx, by] = f(b), vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1e-9
  const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L))
  return { d: Math.hypot(ax + t * vx, ay + t * vy), q: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] }
}
function alBorde(p: LatLng, poly: LatLng[]): { d: number; q: LatLng } {
  let best = { d: Infinity, q: p }
  for (let i = 0; i < poly.length; i++) { const r = alSegmento(p, poly[i], poly[(i + 1) % poly.length]); if (r.d < best.d) best = r }
  return best
}
function adentro(p: LatLng, poly: LatLng[]): boolean {
  let si = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) si = !si
  }
  return si
}

/** Potreros que contienen el punto o cuyo alambrado pasa a menos de `tol` metros. */
export function potrerosEnPunto(p: LatLng, potreros: PotreroDibujado[], tol = 20): PotreroDibujado[] {
  return potreros.filter(x => x.poligono.length >= 3 && (adentro(p, x.poligono) || alBorde(p, x.poligono).d <= tol))
}

/** Una tranquera va sobre el alambrado: si hay uno a menos de `max` metros, se pega a él. */
export function pegarAlBorde(p: LatLng, potreros: PotreroDibujado[], max = 60): LatLng {
  let best = { d: Infinity, q: p }
  for (const x of potreros) { if (x.poligono.length < 3) continue; const r = alBorde(p, x.poligono); if (r.d < best.d) best = r }
  return best.d <= max ? best.q : p
}

/** El potrero más cercano dentro de `max` metros (para algo cargado fuera de los potreros, como el casco). */
export function potreroCercano(p: LatLng, potreros: PotreroDibujado[], max = 1500): PotreroDibujado | null {
  let best: { d: number; x: PotreroDibujado | null } = { d: Infinity, x: null }
  for (const x of potreros) { if (x.poligono.length < 3) continue; const d = adentro(p, x.poligono) ? 0 : alBorde(p, x.poligono).d; if (d < best.d) best = { d, x } }
  return best.d <= max ? best.x : null
}

/** El alambrado que comparten dos potreros, como línea. null si no se tocan. */
export function bordeCompartido(a: PotreroDibujado, b: PotreroDibujado, tol = 25): LatLng[] | null {
  const puntos = [...a.poligono.filter(v => alBorde(v, b.poligono).d <= tol), ...b.poligono.filter(v => alBorde(v, a.poligono).d <= tol)]
  const unicos: LatLng[] = []
  for (const v of puntos) if (!unicos.some(u => metros(u, v) < 8)) unicos.push(v)
  if (unicos.length < 2) return null
  // Ordenar a lo largo de la dirección del borde (los dos puntos más lejanos).
  let [i0, i1, L] = [0, 1, -1]
  for (let i = 0; i < unicos.length; i++) for (let j = i + 1; j < unicos.length; j++) { const d = metros(unicos[i], unicos[j]); if (d > L) [i0, i1, L] = [i, j, d] }
  if (L < 30) return null
  const f = plano(unicos[i0]), [dx, dy] = f(unicos[i1])
  return unicos.map(v => { const [x, y] = f(v); return { v, t: x * dx + y * dy } }).sort((p, q) => p.t - q.t).map(p => p.v)
}

/** Todo el alambrado de un potrero, cerrado. */
export function contorno(a: PotreroDibujado): LatLng[] {
  return a.poligono.length >= 3 ? [...a.poligono, a.poligono[0]] : []
}

export function largo(linea: LatLng[]): number {
  return linea.slice(1).reduce((s, p, i) => s + metros(linea[i], p), 0)
}

/** El punto del medio de una línea (sobre la línea, no el promedio). */
export function medio(linea: LatLng[]): LatLng {
  const total = largo(linea) / 2
  let acc = 0
  for (let i = 1; i < linea.length; i++) {
    const d = metros(linea[i - 1], linea[i])
    if (acc + d >= total) { const t = d ? (total - acc) / d : 0; return [linea[i - 1][0] + t * (linea[i][0] - linea[i - 1][0]), linea[i - 1][1] + t * (linea[i][1] - linea[i - 1][1])] }
    acc += d
  }
  return linea[linea.length - 1]
}

/** Potreros de un elemento guardado: por su punto, o por el medio de su línea. */
export function potrerosDeElemento(e: { lat: number; lng: number; linea?: LatLng[] | null }, potreros: PotreroDibujado[]): PotreroDibujado[] {
  const p: LatLng = e.linea?.length ? medio(e.linea) : [e.lat, e.lng]
  return potrerosEnPunto(p, potreros)
}

/** «tanque australiano del 9B», «tranquera entre el 5B y el 8B», «energizador del casco». */
export function nombreElemento(tipo: TipoInfra, apodo: string | null, potreros: string[]): string {
  const base = `${NOMBRE_TIPO[tipo].toLowerCase()}${apodo ? ` ${apodo}` : ''}`
  if (apodo && /^(?:de|del)\s/i.test(apodo)) return base
  if (potreros.length >= 2) return `${base} entre el ${potreros[0]} y el ${potreros[1]}`
  return potreros.length ? `${base} del ${potreros[0]}` : base
}

export type ComandoInfra =
  | { k: 'electrico_entre'; a: string; b: string }
  | { k: 'electrico_contorno'; p: string }
  | { k: 'borrar'; tipo: TipoInfra; potreros: string[]; apodo: string | null }

const POT = '([0-9]+[a-z]?|[a-z]+[0-9]+[a-z]?)'
/** Eléctricos por borde y bajas. Un reporte («el eléctrico del 8 está cortado») no entra acá. */
export function comandoInfra(texto: string): ComandoInfra | null {
  const t = norm(texto).replace(/[.!?¡¿]+/g, ' ').replace(/\s+/g, ' ').trim()
  const baja = t.match(new RegExp(`^(?:borra|borrar|saca|sacar|elimina|eliminar|quita|quitar)\\s+(?:el|la)\\s+${TIPO_RE.source}\\b\\s*(.*)$`))
  if (baja) {
    const tipo = tipoDe(baja[1]); if (!tipo) return null
    const resto = baja[2]
    const entre = resto.match(new RegExp(`entre (?:el |los )?(?:potreros? )?${POT} y (?:el )?(?:potrero )?${POT}\\b`))
    const del = resto.match(new RegExp(`\\b(?:del|de|en el) (?:potrero )?${POT}\\b`))
    const potreros = entre ? [entre[1], entre[2]] : del ? [del[1]] : []
    const apodo = resto.replace(/\b(?:entre|del|de|en el)\b.*$/, '').trim() || null
    return { k: 'borrar', tipo, potreros, apodo }
  }
  if (!/\belectrico\b/.test(t) || /\b(cortado|cortada|roto|rota|anda|no da|sin corriente|caido|falla|arregl\w*)\b/.test(t)) return null
  const entre = t.match(new RegExp(`\\belectrico\\b.*?\\bentre (?:el |los )?(?:potreros? )?${POT} y (?:el )?(?:potrero )?${POT}\\b`))
  if (entre) return { k: 'electrico_entre', a: entre[1], b: entre[2] }
  const vuelta = t.match(new RegExp(`\\belectrico\\b.*?\\b(?:alrededor|perimetral|perimetro|todo el contorno|toda la vuelta)\\b(?: de| del)?(?: (?:el|potrero))?\\s*${POT}\\s*$`))
  if (vuelta) return { k: 'electrico_contorno', p: vuelta[1] }
  return null
}
