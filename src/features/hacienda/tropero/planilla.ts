import type { Database } from '@/lib/supabase/types'
import { categoriaLabel, categoriaPlural } from '../labels'

// Las caravanas desde una planilla (página 35, «Las caravanas, desde un
// Excel»): la del veterinario o la de SENASA. Puro: encuentra las columnas
// (solo, por los títulos, o con lo que entendió la IA), copia cada celda tal
// como viene y dice qué fila tiene un problema y por qué. Nada se arregla en
// silencio: lo que no se entiende queda marcado para corregirlo en la tabla.

type Categoria = Database['public']['Enums']['categoria_animal']
export type Celda = string | number | boolean | Date | null | undefined
export type Hoja = { nombre: string; filas: Celda[][] }

export type Columna = 'visual' | 'rfid' | 'categoria' | 'potrero' | 'nacimiento' | 'raza'
export type OrdenFecha = 'dia_mes_anio' | 'mes_dia_anio' | 'anio_mes_dia'

/** Cómo leer la planilla: en qué hoja, en qué fila están los títulos, qué columna es cada cosa y qué quiere decir cada palabra. */
export type Interpretacion = {
  hoja: number
  /** Índice (desde 0) de la fila con los títulos. */
  filaTitulos: number
  columnas: Partial<Record<Columna, number>>
  /** «Vaq.» → vaquillona: lo que la planilla dice y la categoría que es. */
  categorias: Record<string, Categoria>
  /** «Pot 3» → el id del 3A. */
  potreros: Record<string, string>
  fecha: OrdenFecha | null
}

/** Una fila para ponerle caravana: de la planilla o escrita a mano. Los textos quedan como se escribieron. */
export type Fila = {
  clave: string
  /** La fila del Excel; null si se escribió a mano. */
  fila: number | null
  visual: string
  rfid: string
  categoria: Categoria | null
  categoriaTexto: string
  potreroId: string | null
  potreroTexto: string
  /** Si el nombre está en más de un campo («1A» en La Porteña y en La Loma): los potreros posibles. */
  potreroCandidatos: string[]
  nacimiento: string | null
  nacimientoTexto: string
  raza: string
}

export type Lectura = {
  filas: Fila[]
  /** Columnas que no encontramos y hacen falta. */
  faltan: string[]
  /** Qué título de la planilla leímos como qué («Nro» → Caravana visible). */
  columnas: { columna: Columna; titulo: string }[]
  hoja: string | null
}

export const NOMBRE_COLUMNA: Record<Columna, string> = {
  visual: 'Caravana visible',
  rfid: 'Electrónica',
  categoria: 'Categoría',
  potrero: 'Potrero',
  nacimiento: 'Nacimiento',
  raza: 'Raza',
}

export const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const texto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())

/** «032 5300 5558 1161» → «032530055581161». */
export const soloDigitos = (t: string) => t.replace(/\D/g, '')

/** Qué columna es cada cosa, por el título. */
const COLUMNAS: { clave: Columna; nombres: RegExp }[] = [
  { clave: 'rfid', nombres: /electr|rfid|chip|eid|boton|baston|15 dig/ },
  { clave: 'visual', nombres: /visible|visual|caravana|tag|numero|nro|n°|^id$|^ident/ },
  { clave: 'categoria', nombres: /categ|tipo|clase/ },
  { clave: 'potrero', nombres: /potrero|lote|cuadro|^pot\b/ },
  { clave: 'nacimiento', nombres: /nac|fecha/ },
  { clave: 'raza', nombres: /raza/ },
]

const CATEGORIAS = new Map<string, Categoria>()
for (const c of Object.keys(categoriaLabel) as Categoria[]) {
  CATEGORIAS.set(sinTildes(categoriaLabel[c]), c)
  CATEGORIAS.set(sinTildes(categoriaPlural[c]), c)
  CATEGORIAS.set(c, c)
}

/** Una fecha de planilla a YYYY-MM-DD; null si no se entiende o no existe. */
export function leerFecha(c: Celda, orden: OrdenFecha | null = null): string | null {
  if (c instanceof Date) return isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10)
  const t = texto(c)
  if (!t) return null
  let a: number, m: number, d: number
  let x = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/)
  if (x) [a, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])]
  else {
    x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
    if (!x) return null
    const anio = x[3]!.length === 2 ? 2000 + Number(x[3]) : Number(x[3])
    ;[a, m, d] = orden === 'mes_dia_anio' ? [anio, Number(x[1]), Number(x[2])] : [anio, Number(x[2]), Number(x[1])]
  }
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** La fila de títulos: la primera que nombra la categoría y alguna caravana (arriba puede haber un título o una explicación). */
function esTitulo(f: Celda[]) {
  const hs = f.map((c) => sinTildes(texto(c)))
  return hs.some((h) => /categ|clase/.test(h)) && hs.some((h) => /visible|visual|caravana|electr|rfid|chip|nro|numero|tag/.test(h))
}

/** Lo que se entiende sin ayuda: la primera hoja con títulos reconocibles. */
export function interpretarSola(hojas: Hoja[]): Interpretacion {
  let hoja = hojas.findIndex((h) => h.filas.some(esTitulo))
  let filaTitulos = hoja >= 0 ? hojas[hoja]!.filas.findIndex(esTitulo) : -1
  if (hoja < 0) {
    hoja = 0
    filaTitulos = (hojas[0]?.filas ?? []).findIndex((f) => f.some((c) => texto(c)))
  }
  const encabezado = (hojas[hoja]?.filas[filaTitulos] ?? []).map((c) => sinTildes(texto(c)))
  const columnas: Partial<Record<Columna, number>> = {}
  for (const { clave, nombres } of COLUMNAS) {
    const i = encabezado.findIndex((h, j) => nombres.test(h) && !Object.values(columnas).includes(j))
    if (i >= 0) columnas[clave] = i
  }
  return { hoja, filaTitulos: Math.max(filaTitulos, 0), columnas, categorias: {}, potreros: {}, fecha: null }
}

export function leerPlanilla(hojas: Hoja[], potreros: { id: string; nombre: string }[], interp: Interpretacion = interpretarSola(hojas)): Lectura {
  const h = hojas[interp.hoja]
  const col = interp.columnas
  // Sólo hace falta la caravana: qué es y dónde está, si la planilla no lo dice, lo dice el productor.
  if (!h || (col.visual === undefined && col.rfid === undefined)) return { filas: [], faltan: ['la columna de la caravana'], columnas: [], hoja: h?.nombre ?? null }

  const titulos = h.filas[interp.filaTitulos] ?? []
  const columnas = (Object.keys(col) as Columna[]).map((c) => ({ columna: c, titulo: texto(titulos[col[c]!]) || `columna ${col[c]! + 1}` }))
  // El nombre del potrero se repite entre campos: un nombre puede ser varios potreros.
  const porNombre = new Map<string, string[]>()
  for (const p of potreros) porNombre.set(sinTildes(p.nombre), [...(porNombre.get(sinTildes(p.nombre)) ?? []), p.id])
  const categoriasIa = new Map(Object.entries(interp.categorias).map(([k, v]) => [sinTildes(k), v]))
  const potrerosIa = new Map(Object.entries(interp.potreros).map(([k, v]) => [sinTildes(k), v]))

  const filas: Fila[] = []
  h.filas.slice(interp.filaTitulos + 1).forEach((f, k) => {
    const celda = (c: Columna) => (col[c] === undefined ? '' : texto(f[col[c]!]))
    if (!f.some((c) => texto(c))) return // fila vacía
    const visual = celda('visual')
    // Excel guarda el chip como número y le come el 0 de adelante (032… → 32…).
    const chip = col.rfid === undefined ? null : f[col.rfid]
    const rfid = typeof chip === 'number' && String(Math.round(chip)).length < 15 ? String(Math.round(chip)).padStart(15, '0') : celda('rfid')
    const categoriaTexto = celda('categoria')
    const potreroTexto = celda('potrero')
    if (!visual && !rfid && !categoriaTexto && !potreroTexto) return // una nota al pie, no un animal
    const nacCelda = col.nacimiento === undefined ? null : f[col.nacimiento]
    const candidatos = potreroTexto ? (potrerosIa.has(sinTildes(potreroTexto)) ? [potrerosIa.get(sinTildes(potreroTexto))!] : (porNombre.get(sinTildes(potreroTexto)) ?? [])) : []
    const n = interp.filaTitulos + k + 2 // número de fila como en el Excel
    filas.push({
      clave: `p${n}`,
      fila: n,
      visual,
      rfid,
      categoria: CATEGORIAS.get(sinTildes(categoriaTexto)) ?? categoriasIa.get(sinTildes(categoriaTexto)) ?? null,
      categoriaTexto,
      potreroId: candidatos.length === 1 ? candidatos[0]! : null,
      potreroTexto,
      potreroCandidatos: candidatos.length > 1 ? candidatos : [],
      nacimiento: leerFecha(nacCelda, interp.fecha),
      nacimientoTexto: texto(nacCelda),
      raza: celda('raza'),
    })
  })
  return { filas, faltan: [], columnas, hoja: h.nombre }
}

/** Lo que haría falta preguntarle a la IA: títulos que no reconocemos, palabras sueltas o fechas raras. */
export function necesitaAyuda(l: Lectura, interp?: Interpretacion) {
  return l.faltan.length > 0 || (interp !== undefined && (interp.columnas.categoria === undefined || interp.columnas.potrero === undefined)) || l.filas.some((f) => (!f.categoria && f.categoriaTexto) || (!f.potreroId && f.potreroTexto) || (!f.nacimiento && f.nacimientoTexto))
}

/**
 * Lo que está mal en el número o en la fecha de cada fila (o nada). Qué es y
 * dónde está se resuelven aparte, en la asignación: no son errores de la
 * planilla sino datos que faltan. Mira también las otras filas para las repetidas.
 */
export function problemasDe(filas: Fila[], yaPuestas: { visual: Set<string>; rfid: Set<string> }): Map<string, string> {
  const out = new Map<string, string>()
  const vistas = new Map<string, Fila>()
  for (const f of filas) {
    const p = problema(f, yaPuestas, vistas)
    if (p) out.set(f.clave, p)
  }
  return out
}

function problema(f: Fila, yaPuestas: { visual: Set<string>; rfid: Set<string> }, vistas: Map<string, Fila>): string | null {
  const visual = soloDigitos(f.visual)
  const rfid = soloDigitos(f.rfid)
  if (!f.visual && !f.rfid) return 'Falta el número de caravana'
  if (/[a-z]/i.test(f.visual)) return `La caravana «${f.visual}» tiene letras: dejá sólo el número`
  if (f.visual && !visual) return `No hay un número en «${f.visual}»`
  if (/[a-z]/i.test(f.rfid)) return `La electrónica «${f.rfid}» tiene letras: son 15 números`
  if (f.rfid && rfid.length !== 15) return `La electrónica tiene ${rfid.length} ${rfid.length === 1 ? 'número' : 'números'} (son 15)`
  if (f.nacimientoTexto && !f.nacimiento) return `No entendimos la fecha «${f.nacimientoTexto}»`
  for (const clave of [visual && `v${visual}`, rfid && `r${rfid}`].filter(Boolean) as string[]) {
    const otra = vistas.get(clave)
    if (otra) return otra.fila ? `Está dos veces (también en la fila ${otra.fila})` : 'Está dos veces'
    vistas.set(clave, f)
  }
  if ((visual && yaPuestas.visual.has(visual)) || (rfid && yaPuestas.rfid.has(rfid))) return 'Ya está puesta en un animal de tu rodeo'
  return null
}

/** Lo que va a la base: los números limpios y la fecha entendida. */
export function paraGuardar(f: Fila) {
  return { visual: soloDigitos(f.visual) || null, rfid: soloDigitos(f.rfid) || null, categoria: f.categoria!, potreroId: f.potreroId, nacimiento: f.nacimiento, raza: f.raza.trim() || null }
}

/**
 * Lo que se le muestra a la IA de cada hoja: las primeras filas tal cual y, por
 * columna, los valores distintos (pocos: categorías y potreros entran enteros;
 * de las caravanas basta una muestra). Así entiende la planilla sin leerla toda.
 */
export function muestraParaIa(hojas: Hoja[]) {
  const corto = (c: Celda) => texto(c).slice(0, 40)
  return hojas.slice(0, 5).map((h) => {
    const anchas = Math.min(20, Math.max(0, ...h.filas.slice(0, 200).map((f) => f.length)))
    return {
      nombre: h.nombre,
      filas: h.filas.length,
      primeras: h.filas.slice(0, 12).map((f) => f.slice(0, anchas).map(corto)),
      valoresPorColumna: Array.from({ length: anchas }, (_, i) => [...new Set(h.filas.slice(0, 2000).map((f) => corto(f[i])).filter(Boolean))].slice(0, 40)),
    }
  })
}

/** «1161, 1162 1170» o un rango «1161-1170» → las caravanas, sin repetir. */
export function caravanasDeTexto(t: string): string[] {
  const out: string[] = []
  for (const parte of t.split(/[\s,;]+/).filter(Boolean)) {
    const r = parte.match(/^(\d+)-(\d+)$/)
    if (r) {
      const [a, b] = [Number(r[1]), Number(r[2])]
      if (b >= a && b - a <= 500) for (let i = a; i <= b; i++) out.push(String(i).padStart(r[1]!.length, '0'))
    } else if (soloDigitos(parte)) out.push(soloDigitos(parte))
  }
  return [...new Set(out)]
}

/** Lee un CSV simple (punto y coma, coma o tabulación) a filas. */
export function leerCsv(t: string): string[][] {
  // El separador: el que más aparece en los primeros renglones (arriba puede haber un título sin ninguno).
  const arriba = t.split('\n').slice(0, 20).join('\n')
  const sep = (['\t', ';', ','] as const).map((s) => ({ s, n: arriba.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s
  return t.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()))
}
