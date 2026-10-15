import type { Database } from '@/lib/supabase/types'
import { categoriaLabel, especiePorCategoria, type Especie } from '../labels'
import { edadMeses, PESO_VENTA_KG, DESTETE_DESDE_M, DESTETE_HASTA_M, type ResumenAnimal } from '../senales'

// Hacienda · El rodeo (página 35): cada animal en una fila que dice qué es,
// dónde está, lo último que se sabe y qué hay que hacer con él. Puro.

type Categoria = Database['public']['Enums']['categoria_animal']

export type AnimalRodeo = {
  id: string
  categoria: Categoria | null
  fecha_nacimiento: string | null
  potrero_id: string | null
  caravana_visual: string | null
  caravana_rfid: string | null
}
export type PotreroRodeo = { id: string; nombre: string; campo_id: string }

/** Qué hay que hacer con el animal. El orden de la lista es el de este tipo. */
export type Estado = 'retiro' | 'destetar' | 'vender' | 'vacia' | 'sinCaravana' | 'sinElectronica' | 'prenada' | 'nada'
export const ORDEN_ESTADO: Estado[] = ['retiro', 'destetar', 'vender', 'vacia', 'sinCaravana', 'sinElectronica', 'prenada', 'nada']
export const ESTADO_TEXTO: Record<Estado, string> = {
  retiro: 'En retiro',
  destetar: 'Para destetar',
  vender: 'Para vender',
  vacia: 'Vacía',
  sinCaravana: 'Sin caravana',
  sinElectronica: 'Sin electrónica',
  prenada: 'Preñada',
  nada: '',
}

export type FilaRodeo = {
  id: string
  especie: Especie
  categoria: Categoria | null
  /** «Ternero, 7 meses» */
  queEs: string
  /** «11B, La Porteña»; null si no está en un potrero. */
  donde: string | null
  campoId: string | null
  visual: string | null
  rfid: string | null
  /** Lo último que se sabe: «186 kg», «Preñada en marzo», «Vacía hoy». */
  ultimoDato: string | null
  estado: Estado
  /** Para la tabla de cada filtro. */
  edad: string | null
  peso: string | null
  /** «Vacía el 09/10» */
  tacto: string | null
  /** «Oxitetraciclina · hasta el 30/10» */
  retiro: string | null
}

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «7 meses», «2 años»; null sin fecha. */
export function edadTexto(fecha: string | null, hoy = new Date()): string | null {
  const m = edadMeses(fecha, hoy)
  if (m == null) return null
  if (m < 24) return m === 1 ? '1 mes' : `${m} meses`
  const a = Math.floor(m / 12)
  return `${a} años`
}

/** «hoy», «en marzo», «el 3 de febrero de 2025» según cuánto hace. */
function cuando(fecha: string, hoyISO: string): string {
  if (fecha === hoyISO) return 'hoy'
  const [y, m, d] = fecha.split('-').map(Number)
  const [hy] = hoyISO.split('-').map(Number)
  return y === hy ? `en ${MES[m! - 1]}` : `el ${d} de ${MES[m! - 1]} de ${y}`
}

const CRIA: Categoria[] = ['ternero', 'ternera', 'cordero', 'cordera']
const ENGORDE: Categoria[] = ['novillo', 'capon']

export function estadoDe(a: AnimalRodeo, r: ResumenAnimal | undefined, hoyISO: string, hoy = new Date()): Estado {
  if (r?.retiroHasta && r.retiroHasta >= hoyISO) return 'retiro'
  const meses = edadMeses(a.fecha_nacimiento, hoy)
  if (a.categoria && CRIA.includes(a.categoria) && meses != null && meses >= DESTETE_DESDE_M && meses <= DESTETE_HASTA_M) return 'destetar'
  if (a.categoria && ENGORDE.includes(a.categoria) && r?.ultimoPeso && r.ultimoPeso.kg >= PESO_VENTA_KG) return 'vender'
  if (r?.ultimoTacto?.resultado === 'vacia' && !r.prenada) return 'vacia'
  if (!a.caravana_visual && !a.caravana_rfid) return 'sinCaravana'
  if (!a.caravana_rfid) return 'sinElectronica'
  if (r?.prenada) return 'prenada'
  return 'nada'
}

function ultimoDato(r: ResumenAnimal | undefined, hoyISO: string): string | null {
  if (!r) return null
  if (r.retiroHasta && r.retiroHasta >= hoyISO) return `${r.tratamiento ?? 'Tratamiento'}, retiro hasta ${r.retiroHasta.slice(8, 10)}/${r.retiroHasta.slice(5, 7)}`
  // Lo más nuevo entre el tacto y la pesada.
  const t = r.ultimoTacto
  const p = r.ultimoPeso
  if (t && (!p || t.fecha >= p.fecha)) return `${t.resultado === 'prenada' ? 'Preñada' : 'Vacía'} ${cuando(t.fecha, hoyISO)}`
  if (p) return `${p.kg.toLocaleString('es-AR')} kg`
  if (r.ultimoParto) return `Parió ${cuando(r.ultimoParto, hoyISO)}`
  return null
}

export function filasDelRodeo(
  animales: AnimalRodeo[],
  potreros: PotreroRodeo[],
  campos: { id: string; nombre: string }[],
  resumen: Map<string, ResumenAnimal>,
  hoyISO: string,
  hoy = new Date(),
): FilaRodeo[] {
  const pot = new Map(potreros.map((p) => [p.id, p]))
  const campo = new Map(campos.map((c) => [c.id, c.nombre]))
  const filas = animales.map<FilaRodeo>((a) => {
    const r = resumen.get(a.id)
    const p = a.potrero_id ? pot.get(a.potrero_id) : undefined
    const edad = edadTexto(a.fecha_nacimiento, hoy)
    return {
      id: a.id,
      especie: a.categoria ? especiePorCategoria[a.categoria] : 'bovino',
      categoria: a.categoria,
      queEs: [a.categoria ? categoriaLabel[a.categoria] : 'Sin categoría', edad].filter(Boolean).join(', '),
      donde: p ? `${p.nombre}, ${campo.get(p.campo_id) ?? ''}`.replace(/, $/, '') : null,
      campoId: p?.campo_id ?? null,
      visual: a.caravana_visual,
      rfid: a.caravana_rfid,
      ultimoDato: ultimoDato(r, hoyISO),
      estado: estadoDe(a, r, hoyISO, hoy),
      edad,
      peso: r?.ultimoPeso ? `${r.ultimoPeso.kg.toLocaleString('es-AR')} kg` : null,
      tacto: r?.ultimoTacto ? `${r.ultimoTacto.resultado === 'prenada' ? 'Preñada' : 'Vacía'} el ${r.ultimoTacto.fecha.slice(8, 10)}/${r.ultimoTacto.fecha.slice(5, 7)}` : null,
      retiro: r?.retiroHasta && r.retiroHasta >= hoyISO ? `${r.tratamiento ?? 'Tratamiento'} · hasta el ${r.retiroHasta.slice(8, 10)}/${r.retiroHasta.slice(5, 7)}` : null,
    }
  })
  // Lo que hay que hacer primero; a igual estado, por caravana.
  return filas.sort((x, y) => ORDEN_ESTADO.indexOf(x.estado) - ORDEN_ESTADO.indexOf(y.estado) || (x.visual ?? '~').localeCompare(y.visual ?? '~', 'es', { numeric: true }))
}

export type ResumenRodeo = {
  total: number
  porEspecie: Record<Especie, number>
  porCampo: { id: string; nombre: string; cabezas: number }[]
  porCategoria: { categoria: Categoria; cabezas: number }[]
  /** Cuántos hay en cada estado (para los chips). */
  porEstado: Partial<Record<Estado, number>>
}

/** Una salida que restó del número sin decir qué animal fue (una fila propia en la lista). */
export type FilaSalida = {
  salidaId: string
  especie: Especie
  categoria: Categoria
  motivo: 'venta' | 'muerte'
  fecha: string
  pendientes: number
  posibles: number
  donde: string
  campoId: string | null
}

export function filasDeSalidas(
  salidas: { salidaId: string; potreroId: string; categoria: Categoria; motivo: 'venta' | 'muerte'; fecha: string; pendientes: number; posibles: number }[],
  potreros: PotreroRodeo[],
  campos: { id: string; nombre: string }[],
): FilaSalida[] {
  const pot = new Map(potreros.map((p) => [p.id, p]))
  const campo = new Map(campos.map((c) => [c.id, c.nombre]))
  return salidas.map((x) => {
    const p = pot.get(x.potreroId)
    return {
      salidaId: x.salidaId,
      especie: especiePorCategoria[x.categoria],
      categoria: x.categoria,
      motivo: x.motivo,
      fecha: x.fecha,
      pendientes: x.pendientes,
      posibles: x.posibles,
      donde: p ? `${p.nombre}${campo.get(p.campo_id) ? `, ${campo.get(p.campo_id)}` : ''}` : '',
      campoId: p?.campo_id ?? null,
    }
  })
}

/**
 * El resumen del rodeo. Las salidas sin identificar ya no están: se restan de
 * la categoría, la especie y el campo (los animales posibles siguen en la lista,
 * porque no se sabe cuál salió).
 */
export function resumirRodeo(filas: FilaRodeo[], campos: { id: string; nombre: string }[], salidas: FilaSalida[] = []): ResumenRodeo {
  const porEspecie: Record<Especie, number> = { bovino: 0, ovino: 0, equino: 0 }
  const cats = new Map<Categoria, number>()
  const porCampo = new Map<string, number>()
  const porEstado: Partial<Record<Estado, number>> = {}
  for (const f of filas) {
    porEspecie[f.especie] += 1
    if (f.categoria) cats.set(f.categoria, (cats.get(f.categoria) ?? 0) + 1)
    if (f.campoId) porCampo.set(f.campoId, (porCampo.get(f.campoId) ?? 0) + 1)
    porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1
  }
  for (const x of salidas) {
    porEspecie[x.especie] -= x.pendientes
    cats.set(x.categoria, (cats.get(x.categoria) ?? 0) - x.pendientes)
    if (x.campoId) porCampo.set(x.campoId, (porCampo.get(x.campoId) ?? 0) - x.pendientes)
  }
  const sinIdentificar = salidas.reduce((t, x) => t + x.pendientes, 0)
  return {
    total: filas.length - sinIdentificar,
    porEspecie,
    porCampo: campos.flatMap((c) => ((porCampo.get(c.id) ?? 0) > 0 ? [{ id: c.id, nombre: c.nombre, cabezas: porCampo.get(c.id)! }] : [])),
    porCategoria: [...cats].filter(([, n]) => n > 0).map(([categoria, cabezas]) => ({ categoria, cabezas })).sort((a, b) => b.cabezas - a.cabezas),
    porEstado,
  }
}

/**
 * «172 en La Porteña y 46 en Los Pampas. Más 30 ovinos y 4 equinos.» El reparto
 * por campo es de la especie que se mira (cuadra con el número grande); las
 * otras especies, de todo el rodeo.
 */
export function bajadaDelRodeo(deEspecie: ResumenRodeo, todo: ResumenRodeo, especie: Especie | 'todas', unCampo: boolean): string {
  const partes: string[] = []
  if (!unCampo && deEspecie.porCampo.length > 1) {
    const xs = deEspecie.porCampo.map((c) => `${c.cabezas} en ${c.nombre}`)
    partes.push(`${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}.`)
  }
  const nombre: Record<Especie, [string, string]> = { bovino: ['vacuno', 'vacunos'], ovino: ['ovino', 'ovinos'], equino: ['equino', 'equinos'] }
  const lista = (es: Especie[]) => {
    const xs = es.map((e) => `${todo.porEspecie[e]} ${nombre[e][todo.porEspecie[e] === 1 ? 0 : 1]}`)
    return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : (xs[0] ?? '')
  }
  const hay = (['bovino', 'ovino', 'equino'] as Especie[]).filter((e) => todo.porEspecie[e] > 0)
  if (especie === 'todas') {
    if (hay.length > 1) partes.push(`Son ${lista(hay)}.`)
  } else {
    const otras = hay.filter((e) => e !== especie)
    if (otras.length) partes.push(`Más ${lista(otras)}.`)
  }
  return partes.join(' ')
}
