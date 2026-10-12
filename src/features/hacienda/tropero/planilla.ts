import type { Database } from '@/lib/supabase/types'
import { categoriaLabel, categoriaPlural } from '../labels'

// La planilla de caravanas (página 35, «Las caravanas, desde un Excel»): la
// del veterinario, la de SENASA o la del bastón. Puro: lee las columnas, las
// entiende y separa lo que está listo de lo que hay que corregir.

type Categoria = Database['public']['Enums']['categoria_animal']
type Celda = string | number | boolean | Date | null | undefined

export type FilaPlanilla = {
  fila: number
  visual: string | null
  rfid: string | null
  categoria: Categoria | null
  potreroId: string | null
  potrero: string | null
  nacimiento: string | null
  raza: string | null
}
export type Problema = { fila: number; caravana: string; problema: string }
export type Lectura = {
  filas: number
  completas: FilaPlanilla[]
  sinElectronica: FilaPlanilla[]
  paraCorregir: Problema[]
  /** Columnas que no encontramos y hacen falta. */
  faltan: string[]
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const texto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())

/** Qué columna es cada cosa, por el encabezado. */
const COLUMNAS: { clave: keyof Omit<FilaPlanilla, 'fila' | 'potreroId'>; nombres: RegExp }[] = [
  { clave: 'rfid', nombres: /electr|rfid|chip|eid|boton|baston|15 dig/ },
  { clave: 'visual', nombres: /visible|visual|caravana|tag|numero|nro|n°/ },
  { clave: 'categoria', nombres: /categ|tipo|clase/ },
  { clave: 'potrero', nombres: /potrero|lote|cuadro/ },
  { clave: 'nacimiento', nombres: /nac|fecha/ },
  { clave: 'raza', nombres: /raza/ },
]

const CATEGORIAS = new Map<string, Categoria>()
for (const c of Object.keys(categoriaLabel) as Categoria[]) {
  CATEGORIAS.set(sinTildes(categoriaLabel[c]), c)
  CATEGORIAS.set(sinTildes(categoriaPlural[c]), c)
  CATEGORIAS.set(c, c)
}

/** «032 5300 5558 1161» → 15 dígitos; null si no hay número. */
export const soloDigitos = (t: string) => t.replace(/\D/g, '')

/** Una fecha de planilla (dd/mm/aaaa, aaaa-mm-dd o fecha de Excel) a YYYY-MM-DD. */
function fecha(c: Celda): string | null {
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  const t = texto(c)
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return null
}

export function leerPlanilla(
  filas: Celda[][],
  potreros: { id: string; nombre: string }[],
  yaPuestas: { visual: Set<string>; rfid: Set<string> },
): Lectura {
  const vacia: Lectura = { filas: 0, completas: [], sinElectronica: [], paraCorregir: [], faltan: [] }
  const inicio = filas.findIndex((f) => f.some((c) => texto(c)))
  if (inicio < 0) return { ...vacia, faltan: ['Caravana visible', 'Categoría'] }
  const encabezado = filas[inicio]!.map((c) => sinTildes(texto(c)))
  const col: Partial<Record<string, number>> = {}
  for (const { clave, nombres } of COLUMNAS) {
    const i = encabezado.findIndex((h, j) => nombres.test(h) && !Object.values(col).includes(j))
    if (i >= 0) col[clave] = i
  }
  const faltan = [col.visual === undefined && col.rfid === undefined ? 'Caravana visible' : null, col.categoria === undefined ? 'Categoría' : null].filter(Boolean) as string[]
  if (faltan.length) return { ...vacia, faltan }

  const porNombre = new Map(potreros.map((p) => [sinTildes(p.nombre), p]))
  const vistas = new Map<string, number>()
  const out: Lectura = { ...vacia }
  filas.slice(inicio + 1).forEach((f, k) => {
    const n = inicio + k + 2 // número de fila como en el Excel
    const celda = (clave: string) => (col[clave] === undefined ? '' : texto(f[col[clave]!]))
    const visual = soloDigitos(celda('visual')) || null
    const rfid = soloDigitos(celda('rfid')) || null
    if (!visual && !rfid && !celda('categoria')) return // fila vacía
    out.filas += 1
    const nombre = visual ?? rfid ?? `fila ${n}`
    const mal = (problema: string) => out.paraCorregir.push({ fila: n, caravana: nombre, problema })

    if (rfid && rfid.length !== 15) return mal(`La electrónica tiene ${rfid.length} dígitos (son 15)`)
    const categoria = CATEGORIAS.get(sinTildes(celda('categoria'))) ?? null
    if (!categoria) return mal(celda('categoria') ? `No conocemos la categoría «${celda('categoria')}»` : 'Falta la categoría')
    const pot = celda('potrero') ? (porNombre.get(sinTildes(celda('potrero'))) ?? null) : null
    if (celda('potrero') && !pot) return mal(`No hay un potrero «${celda('potrero')}»`)
    const clave = visual ?? rfid!
    if (vistas.has(clave)) return mal(`Está dos veces (también en la fila ${vistas.get(clave)})`)
    vistas.set(clave, n)
    if ((visual && yaPuestas.visual.has(visual)) || (rfid && yaPuestas.rfid.has(rfid))) return mal('Ya está puesta en un animal de tu rodeo')

    const fila: FilaPlanilla = { fila: n, visual, rfid, categoria, potreroId: pot?.id ?? null, potrero: pot?.nombre ?? null, nacimiento: fecha(col.nacimiento === undefined ? null : f[col.nacimiento]), raza: celda('raza') || null }
    if (rfid) out.completas.push(fila)
    else out.sinElectronica.push(fila)
  })
  return out
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

/** La planilla de ejemplo para bajar (CSV, se abre con Excel). */
export const PLANILLA_EJEMPLO = 'Caravana visible;Categoría;Potrero;Electrónica;Nacimiento;Raza\n1161;Ternero;11B;032530055581161;03/02/2026;Angus\n1040;Vaca;11B;032530055581040;;Angus\n1172;Ternero;11B;;;\n'

/** Lee un CSV simple (punto y coma o coma) a filas. */
export function leerCsv(t: string): string[][] {
  const sep = (t.split('\n')[0] ?? '').includes(';') ? ';' : ','
  return t.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()))
}
