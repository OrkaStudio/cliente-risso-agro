import type { Database } from '@/lib/supabase/types'
import { categoriaLabel, categoriaPlural } from '../labels'
import { asignables, asignar, type PotreroRef, type SinCaravana } from './asignacion'
import { paraGuardar, problemasDe, sinTildes, soloDigitos, type Fila } from './planilla'

// Caravanas desde una planilla, por grupos y no por filas (prototipo del
// 19/10). Puro: con la planilla, el rodeo y lo que respondió el productor,
// dice qué falta preguntar, qué grupos no cierran y qué se guarda. Nada se
// supone: lo que no dice la planilla ni respondió el productor no se pone.

type Categoria = Database['public']['Enums']['categoria_animal']

/** Un animal activo del rodeo, con su caravana si tiene. */
export type DelRodeo = SinCaravana & { visual: string | null; rfid: string | null }

export type Respuestas = {
  /** Con columna «qué es»: cada palabra de la planilla → categoría. */
  que: Record<string, Categoria | ''>
  /** Sin esa columna: todos lo mismo o por tramos de números. */
  sinQue: { modo: '' | 'uno' | 'varios'; uno: Categoria | ''; tramos: { desde: string; hasta: string; categoria: Categoria | '' }[] }
  /** Con columna «dónde»: cada palabra → potrero. */
  donde: Record<string, string>
  /** Sin esa columna: todos en un potrero o uno por categoría. */
  sinDonde: { modo: '' | 'uno' | 'varios'; potrero: string; porCategoria: Partial<Record<Categoria, string>> }
  /** Grupo que no cierra → qué pasó. */
  noCierra: Record<string, { que: 'entraron' | 'otro' | 'ninguna'; desde?: string; hasta?: string; potrero?: string }>
  /** Sumar el chip a los que ya tenían la visible. */
  chip: boolean
}

export const respuestasVacias = (): Respuestas => ({
  que: {},
  sinQue: { modo: '', uno: '', tramos: [{ desde: '', hasta: '', categoria: '' }] },
  donde: {},
  sinDonde: { modo: '', potrero: '', porCategoria: {} },
  noCierra: {},
  chip: true,
})

const CATEGORIAS = new Map<string, Categoria>()
for (const c of Object.keys(categoriaLabel) as Categoria[]) {
  CATEGORIAS.set(sinTildes(categoriaLabel[c]), c)
  CATEGORIAS.set(sinTildes(categoriaPlural[c]), c)
  CATEGORIAS.set(c, c)
}
/** La categoría que dice una palabra, si se entiende sola («Vaquillonas» → vaquillona). */
export const categoriaDeTexto = (t: string) => CATEGORIAS.get(sinTildes(t)) ?? null

export type Palabra = { texto: string; filas: number; sola: Categoria | null }
export type Lugar = { texto: string; filas: number; candidatos: string[] }

/**
 * Las palabras de la planilla con lo que se entiende solo: la categoría que
 * dicen y los potreros con ese nombre (puede haber uno en cada campo).
 */
export function palabrasYLugares(filas: Fila[], potreros: PotreroRef[]) {
  const palabras = new Map<string, Palabra>()
  const lugares = new Map<string, Lugar>()
  for (const f of filas) {
    if (f.categoriaTexto) {
      const p = palabras.get(f.categoriaTexto) ?? { texto: f.categoriaTexto, filas: 0, sola: categoriaDeTexto(f.categoriaTexto) }
      p.filas++
      palabras.set(f.categoriaTexto, p)
    }
    if (f.potreroTexto) {
      const l = lugares.get(f.potreroTexto) ?? { texto: f.potreroTexto, filas: 0, candidatos: potreros.filter((p) => sinTildes(p.nombre) === sinTildes(f.potreroTexto)).map((p) => p.id) }
      l.filas++
      lugares.set(f.potreroTexto, l)
    }
  }
  return { palabras: [...palabras.values()].sort((a, b) => b.filas - a.filas), lugares: [...lugares.values()].sort((a, b) => b.filas - a.filas) }
}

/** Respuestas de entrada: lo que se entiende solo, y lo que sugiere la IA (marcado para confirmar). */
export function respuestasIniciales(filas: Fila[], potreros: PotreroRef[], ia?: { categorias: Record<string, Categoria>; potreros: Record<string, string> }) {
  const r = respuestasVacias()
  const { palabras, lugares } = palabrasYLugares(filas, potreros)
  const sugeridas = new Set<string>()
  for (const p of palabras) {
    const c = p.sola ?? ia?.categorias[p.texto] ?? ''
    r.que[p.texto] = c
    if (!p.sola && c) sugeridas.add(`que:${p.texto}`)
  }
  for (const l of lugares) {
    const id = l.candidatos.length === 1 ? l.candidatos[0]! : l.candidatos.length === 0 ? (ia?.potreros[l.texto] ?? '') : ''
    r.donde[l.texto] = id
    if (l.candidatos.length === 0 && id) sugeridas.add(`donde:${l.texto}`)
  }
  return { respuestas: r, sugeridas }
}

export type Clase = 'poner' | 'ya' | 'chip' | 'error'

/** Las filas que ya están en el rodeo: si ya tienen todo, se saltean; si les falta el chip, se ofrece sumarlo. */
export function clasificar(filas: Fila[], rodeo: DelRodeo[]) {
  const errores = problemasDe(filas, { visual: new Set(), rfid: new Set() })
  const porVisual = new Map(rodeo.filter((a) => a.visual).map((a) => [soloDigitos(a.visual!), a]))
  const porChip = new Map(rodeo.filter((a) => a.rfid).map((a) => [soloDigitos(a.rfid!), a]))
  const clase = new Map<string, { clase: Clase; motivo?: string; animalId?: string }>()
  for (const f of filas) {
    const e = errores.get(f.clave)
    if (e) {
      clase.set(f.clave, { clase: 'error', motivo: e })
      continue
    }
    const v = soloDigitos(f.visual), r = soloDigitos(f.rfid)
    const conVisual = v ? porVisual.get(v) : undefined
    const conChip = r ? porChip.get(r) : undefined
    if (conChip && conChip.id !== conVisual?.id) {
      if (conVisual) clase.set(f.clave, { clase: 'error', motivo: `El chip es de otro animal, no de la ${v}` })
      else if (v) clase.set(f.clave, { clase: 'error', motivo: `El chip ya está puesto en ${conChip.visual ? `la ${soloDigitos(conChip.visual)}` : 'otro animal'}` })
      else clase.set(f.clave, { clase: 'ya' }) // sólo el chip, y ya está puesto
      continue
    }
    if (conVisual) {
      if (r && conVisual.rfid && soloDigitos(conVisual.rfid) !== r) clase.set(f.clave, { clase: 'error', motivo: `La ${v} ya tiene otro chip en Tropero` })
      else if (r && !conVisual.rfid) clase.set(f.clave, { clase: 'chip', animalId: conVisual.id })
      else clase.set(f.clave, { clase: 'ya' })
      continue
    }
    clase.set(f.clave, { clase: 'poner' })
  }
  return clase
}

function enTramo(f: Fila, tramos: Respuestas['sinQue']['tramos']) {
  const n = Number(soloDigitos(f.visual))
  if (!soloDigitos(f.visual)) return null
  return tramos.find((t) => t.categoria && soloDigitos(t.desde) && Number(soloDigitos(t.desde)) <= n && n <= Number(soloDigitos(t.hasta) || soloDigitos(t.desde)))?.categoria || null
}

/** Las filas para poner, con la categoría y el potrero que salen de las respuestas. */
export function aplicarRespuestas(filas: Fila[], r: Respuestas, conQue: boolean, conDonde: boolean): Fila[] {
  return filas.map((f) => {
    const categoria = conQue ? r.que[f.categoriaTexto] || null : r.sinQue.modo === 'uno' ? r.sinQue.uno || null : r.sinQue.modo === 'varios' ? enTramo(f, r.sinQue.tramos) : null
    let potreroId = conDonde ? r.donde[f.potreroTexto] || null : r.sinDonde.modo === 'uno' ? r.sinDonde.potrero || null : r.sinDonde.modo === 'varios' && categoria ? r.sinDonde.porCategoria[categoria] || null : null
    // «Estaban en otro potrero»: los números de ese tramo van al potrero elegido.
    for (const [clave, d] of Object.entries(r.noCierra)) {
      if (d.que !== 'otro' || !d.potrero || !soloDigitos(d.desde ?? '')) continue
      const [pot, cat] = clave.split('|')
      const n = Number(soloDigitos(f.visual))
      if (potreroId === pot && categoria === cat && soloDigitos(f.visual) && n >= Number(soloDigitos(d.desde!)) && n <= Number(soloDigitos(d.hasta || d.desde!))) potreroId = d.potrero
    }
    // Sin palabra en la planilla, el texto queda vacío: así nadie lo confunde con «no sabemos qué es».
    return { ...f, categoria, potreroId, potreroCandidatos: [], potreroTexto: potreroId ? f.potreroTexto : '', categoriaTexto: categoria ? f.categoriaTexto : f.categoriaTexto }
  })
}

export type Plan = {
  filas: { animalId: string; visual: string | null; rfid: string | null; nacimiento: string | null; raza: string | null }[]
  chips: { animalId: string; rfid: string }[]
  altas: { categoria: Categoria; potreroId: string; visual: string | null; rfid: string | null; nacimiento: string | null; raza: string | null }[]
  grupos: { clave: string; categoria: Categoria; potreroId: string; antes: number; despues: number; numeros: string[]; nuevas: number }[]
  noCierran: { clave: string; categoria: Categoria; potreroId: string; planilla: number; hay: number; numeros: string[] }[]
  afuera: { clave: string; categoria: Categoria; potreroId: string; cuantas: number }[]
  faltanQue: number
  faltanDonde: number
  ya: number
  conChip: number
  errores: { fila: Fila; motivo: string }[]
}

/** Todo lo que sale de la planilla con las respuestas de hoy. */
export function planificar(filas: Fila[], rodeo: DelRodeo[], potreros: PotreroRef[], r: Respuestas, conQue: boolean, conDonde: boolean): Plan {
  const clase = clasificar(filas, rodeo)
  const poner = filas.filter((f) => clase.get(f.clave)?.clase === 'poner')
  const resueltas = aplicarRespuestas(poner, r, conQue, conDonde)
  const sin = rodeo.filter((a) => !a.visual && !a.rfid)
  const { porFila, grupos } = asignar(resueltas, sin, new Map(), potreros)

  const plan: Plan = {
    filas: [],
    chips: r.chip ? filas.filter((f) => clase.get(f.clave)?.clase === 'chip').map((f) => ({ animalId: clase.get(f.clave)!.animalId!, rfid: soloDigitos(f.rfid) })) : [],
    altas: [],
    grupos: [],
    noCierran: [],
    afuera: [],
    faltanQue: resueltas.filter((f) => !f.categoria).length,
    faltanDonde: resueltas.filter((f) => f.categoria && !f.potreroId).length,
    ya: filas.filter((f) => clase.get(f.clave)?.clase === 'ya').length,
    conChip: filas.filter((f) => clase.get(f.clave)?.clase === 'chip').length,
    errores: filas.filter((f) => clase.get(f.clave)?.clase === 'error').map((f) => ({ fila: f, motivo: clase.get(f.clave)!.motivo ?? '' })),
  }

  for (const g of grupos) {
    const numeros = g.filas.map((f) => soloDigitos(f.visual) || soloDigitos(f.rfid))
    const { libres } = asignables(sin, g.potreroId, g.categoria)
    const antes = sin.filter((a) => a.potreroId === g.potreroId && a.categoria === g.categoria).length
    if (g.entra) {
      for (const f of g.filas) plan.filas.push({ ...paraGuardar(f), animalId: porFila.get(f.clave)!.animalId! })
      plan.grupos.push({ clave: g.clave, categoria: g.categoria, potreroId: g.potreroId, antes, despues: antes - g.filas.length, numeros, nuevas: 0 })
      continue
    }
    const d = r.noCierra[g.clave]
    if (!d || (d.que === 'otro' && !d.potrero)) {
      plan.noCierran.push({ clave: g.clave, categoria: g.categoria, potreroId: g.potreroId, planilla: g.filas.length, hay: libres.length, numeros })
      continue
    }
    if (d.que === 'ninguna' || d.que === 'otro') {
      // «otro» con potrero elegido ya movió esos números en aplicarRespuestas; si igual no cierra, sigue sin poner.
      plan.afuera.push({ clave: g.clave, categoria: g.categoria, potreroId: g.potreroId, cuantas: g.filas.length })
      continue
    }
    // Entraron: los que hay sin caravana reciben número; el resto se da de alta en ese potrero.
    g.filas.forEach((f, i) => {
      const x = paraGuardar(f)
      if (i < libres.length) plan.filas.push({ ...x, animalId: libres[i]!.id })
      else plan.altas.push({ categoria: g.categoria, potreroId: g.potreroId, visual: x.visual, rfid: x.rfid, nacimiento: x.nacimiento, raza: x.raza })
    })
    plan.grupos.push({ clave: g.clave, categoria: g.categoria, potreroId: g.potreroId, antes, despues: Math.max(0, antes - libres.length), numeros, nuevas: g.filas.length - libres.length })
  }
  return plan
}

/** Cuántos de esas categorías hay sin caravana en un potrero, contando sólo a los que se les puede poner por planilla. */
export function sinCaravanaEn(rodeo: DelRodeo[], potreroId: string, categorias: Categoria[]) {
  const sin = rodeo.filter((a) => !a.visual && !a.rfid)
  return categorias.reduce((t, c) => t + asignables(sin, potreroId, c).libres.length, 0)
}
