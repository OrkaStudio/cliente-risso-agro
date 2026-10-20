import type { Database } from '@/lib/supabase/types'
import { categoriaLabel } from '../labels'
import { partoEstimado, type ResumenAnimal } from '../senales'
import { edadTexto, type Estado } from './rodeo'

// Hacienda · Ficha del animal (página 35): quién es en una frase, lo que hay
// que saber en filas cortas y su historia, que no se borra nunca. Puro.

type TipoEvento = Database['public']['Enums']['tipo_evento']
type Categoria = Database['public']['Enums']['categoria_animal']

export type EventoFicha = { id: string; tipo: TipoEvento; fecha: string; datos: unknown; nota: string | null }
export type Tono = 'principal' | 'bien' | 'atencion' | 'problema' | 'neutro'

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const dato = (d: unknown, k: string): unknown => (d && typeof d === 'object' ? (d as Record<string, unknown>)[k] : undefined)
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** «22 sep» */
export const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]}`
/** «21/08» */
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** «7 meses. Angus negro. Hoy en el 11B de La Porteña.» */
export function fraseDelAnimal(
  a: { fecha_nacimiento: string | null; raza: string | null; pelaje: string | null },
  donde: { potrero: string; campo: string | null } | null,
  hoy = new Date(),
  /** Si ya no está en el rodeo: cuándo salió (o murió). */
  salio?: { fecha: string; murio: boolean; corregido?: boolean } | null,
): string {
  const partes: string[] = []
  const edad = edadTexto(a.fecha_nacimiento, hoy)
  if (edad) partes.push(edad.charAt(0).toUpperCase() + edad.slice(1))
  const raza = [texto(a.raza), texto(a.pelaje)?.toLowerCase()].filter(Boolean).join(' ')
  if (raza) partes.push(raza.charAt(0).toUpperCase() + raza.slice(1))
  const lugar = donde ? `el ${donde.potrero}${donde.campo ? ` de ${donde.campo}` : ''}` : null
  if (salio?.corregido) partes.push(`Se sacó ${lugar ? `d${lugar}` : 'del rodeo'} el ${ddmm(salio.fecha)}: estaba cargado de más`.replace('del el ', 'del '))
  else if (salio) partes.push(`${salio.murio ? 'Murió en' : 'Salió de'} ${lugar ?? 'el campo'} el ${ddmm(salio.fecha)}`.replace('Salió de el ', 'Salió del '))
  else partes.push(lugar ? `Hoy en ${lugar}` : 'Todavía no está en un potrero')
  return partes.join('. ') + '.'
}

/** El aviso de la ficha según su estado en el rodeo; null si no hay nada que avisar. */
export function avisoDelAnimal(estado: Estado, r: ResumenAnimal | undefined): { texto: string; tono: Tono } | null {
  switch (estado) {
    case 'retiro':
      return { texto: `En retiro hasta el ${ddmm(r!.retiroHasta!)}: no se vende`, tono: 'problema' }
    case 'destetar':
      return { texto: 'Para destetar', tono: 'atencion' }
    case 'vender':
      return { texto: 'Listo para vender', tono: 'principal' }
    case 'vacia':
      return { texto: 'Vacía en el último tacto', tono: 'problema' }
    case 'prenada': {
      const p = r?.prenada ? partoEstimado(r.prenada) : null
      return { texto: p ? `Preñada · pare en ${MES[Number(p.slice(5, 7)) - 1]}` : 'Preñada', tono: 'bien' }
    }
    default:
      return null
  }
}

const CRIA: Categoria[] = ['ternero', 'ternera', 'cordero', 'cordera']

/** «Lo que hay que saber»: filas cortas, sólo las que tienen dato. */
export function loQueHayQueSaber(
  a: { categoria: Categoria | null; fecha_nacimiento: string | null; origen: string | null },
  r: ResumenAnimal | undefined,
  eventos: EventoFicha[],
  tropa: string | null,
  hoy = new Date(),
  /** El aviso de arriba ya dice preñada o vacía: el tacto no se repite. */
  tactoArriba = false,
): { nombre: string; valor: string }[] {
  const filas: { nombre: string; valor: string }[] = []
  const ultimo = (t: TipoEvento) => eventos.filter((e) => e.tipo === t).sort((x, y) => y.fecha.localeCompare(x.fecha))[0]
  // La edad va arriba, en sus rasgos; el potrero, en «Dónde está».
  if (r?.ultimoPeso) filas.push({ nombre: 'Último peso', valor: `${r.ultimoPeso.kg.toLocaleString('es-AR')} kg, ${ddmm(r.ultimoPeso.fecha)}` })
  if (r?.ultimoTacto && !tactoArriba) {
    const p = r.prenada ? partoEstimado(r.prenada) : null
    filas.push({
      nombre: 'Último tacto',
      valor: r.ultimoTacto.resultado === 'prenada' ? `Preñada, ${ddmm(r.ultimoTacto.fecha)}${p ? ` · pare en ${MES[Number(p.slice(5, 7)) - 1]}` : ''}` : `Vacía, ${ddmm(r.ultimoTacto.fecha)}`,
    })
  }
  if (r && r.partos > 0) filas.push({ nombre: 'Partos', valor: `${r.partos}${r.ultimoParto ? ` · el último en ${MES[Number(r.ultimoParto.slice(5, 7)) - 1]} de ${r.ultimoParto.slice(0, 4)}` : ''}` })
  const san = ultimo('sanidad')
  if (san) filas.push({ nombre: 'Última sanidad', valor: `${texto(dato(san.datos, 'tratamiento')) ?? 'Sanidad'}, ${ddmm(san.fecha)}` })
  if (a.categoria && CRIA.includes(a.categoria) && a.fecha_nacimiento && !ultimo('destete')) {
    const [y, m] = a.fecha_nacimiento.split('-').map(Number)
    const t = m! - 1 + 8
    filas.push({ nombre: 'Destete', valor: `Previsto para ${MES[t % 12]}${y! + Math.floor(t / 12) !== hoy.getFullYear() ? ` de ${y! + Math.floor(t / 12)}` : ''}, a los 8 meses` })
  }
  if (tropa) filas.push({ nombre: 'Tropa', valor: tropa })
  if (texto(a.origen) && !['onboarding', 'nacimiento'].includes(a.origen!)) filas.push({ nombre: 'Origen', valor: a.origen! })
  return filas
}

/** «Su historia»: cada evento con un título corto y su detalle. Lo más nuevo arriba. */
export function historiaDelAnimal(eventos: EventoFicha[]): { id: string; dia: string; anio: string; titulo: string; detalle: string | null; tono: Tono }[] {
  // Las bajas que después se deshicieron (volvió al rodeo): se muestran como lo
  // que fueron, una anotación corregida, no como una venta o una muerte.
  const deshechas = new Set(
    eventos.filter((e) => e.tipo === 'nota' && dato(e.datos, 'vuelve_al_rodeo')).flatMap((e) => {
      const r = texto(dato(e.datos, 'resuelve'))
      const sal = texto(dato(e.datos, 'anula_salida'))
      return eventos.filter((b) => b.tipo === 'baja' && (b.id === r || (sal && dato(b.datos, 'salida_id') === sal))).map((b) => b.id)
    }),
  )
  // Las cargas de caravanas que después se deshicieron.
  const lotesDeshechos = new Set(eventos.filter((e) => e.tipo === 'nota' && texto(dato(e.datos, 'deshace'))).map((e) => texto(dato(e.datos, 'deshace'))))
  return [...eventos]
    .sort((x, y) => y.fecha.localeCompare(x.fecha))
    .map((e) => {
      const d = e.datos
      const nota = texto(e.nota)
      const base = { id: e.id, dia: diaCorto(e.fecha), anio: e.fecha.slice(0, 4) }
      switch (e.tipo) {
        case 'alta':
          return { ...base, titulo: 'Alta', detalle: dato(d, 'carga') === 'masiva' ? 'Cargado con el campo, sin caravana' : texto(dato(d, 'caravana')) ? `Con la caravana ${dato(d, 'caravana')}` : nota, tono: 'neutro' as Tono }
        case 'movimiento': {
          const de = texto(dato(d, 'potrero_origen'))
          const a = texto(dato(d, 'potrero_destino'))
          return { ...base, titulo: a ? `Pasó al ${a}` : 'Se movió', detalle: de ? `Venía del ${de}` : nota, tono: 'atencion' as Tono }
        }
        case 'sanidad': {
          const t = texto(dato(d, 'tratamiento'))
          const hasta = texto(dato(d, 'retiro_hasta'))
          return { ...base, titulo: 'Sanidad', detalle: [t, hasta ? `retiro hasta el ${ddmm(hasta)}` : null, nota].filter(Boolean).join(' · ') || null, tono: hasta ? ('problema' as Tono) : ('bien' as Tono) }
        }
        case 'tacto': {
          const res = dato(d, 'resultado')
          const meses = Number(dato(d, 'meses'))
          return { ...base, titulo: 'Tacto', detalle: res === 'prenada' ? `Preñada${meses ? `, ${meses} meses` : ''}` : res === 'vacia' ? 'Vacía' : nota, tono: res === 'vacia' ? ('problema' as Tono) : ('bien' as Tono) }
        }
        case 'pesaje': {
          const kg = Number(dato(d, 'kg'))
          return { ...base, titulo: 'Pesada', detalle: kg ? `${kg.toLocaleString('es-AR')} kg` : nota, tono: 'principal' as Tono }
        }
        case 'parto':
          return { ...base, titulo: 'Parió', detalle: nota, tono: 'bien' as Tono }
        case 'destete':
          return { ...base, titulo: 'Destete', detalle: nota, tono: 'principal' as Tono }
        case 'cambio_caravana': {
          const nueva = texto(dato(d, 'visual')) ?? texto(dato(d, 'nuevo'))
          const antes = texto(dato(dato(d, 'antes'), 'visual')) ?? texto(dato(dato(d, 'antes'), 'rfid'))
          return { ...base, titulo: nueva ? `Caravana nueva: la ${nueva}` : 'Caravana nueva', detalle: antes ? `Antes tenía la ${antes}` : nota, tono: 'principal' as Tono }
        }
        case 'caravana_asignada': {
          const v = texto(dato(d, 'visual'))
          const lote = texto(dato(d, 'lote'))
          const detalle = dato(d, 'emparejada')
            ? 'Se emparejó el chip en la manga'
            : dato(d, 'origen') === 'planilla'
              ? `${v ? `La ${v}, ` : ''}por planilla${lote && lotesDeshechos.has(lote) ? ' (después se deshizo)' : texto(dato(d, 'rfid')) ? '' : ' (falta el chip)'}`
              : v
                ? `La ${v}`
                : texto(dato(d, 'rfid'))
                  ? `El chip ${dato(d, 'rfid')}`
                  : nota
          return { ...base, titulo: 'Caravana', detalle, tono: 'principal' as Tono }
        }
        case 'baja': {
          const est = dato(d, 'estado')
          if (deshechas.has(e.id))
            return { ...base, titulo: est === 'muerto' ? 'Se anotó como muerta' : 'Se anotó como vendida', detalle: 'Después se corrigió: no era ésta', tono: 'neutro' as Tono }
          if (dato(d, 'sin_identificar')) return { ...base, titulo: est === 'muerto' ? 'Murió' : 'Se vendió', detalle: 'Sin identificar: no se supo cuál fue', tono: 'problema' as Tono }
          return { ...base, titulo: est === 'vendido' ? 'Se vendió' : est === 'muerto' ? 'Murió' : 'Baja', detalle: nota, tono: 'problema' as Tono }
        }
        case 'nota':
          if (dato(d, 'vuelve_al_rodeo')) return { ...base, titulo: 'Volvió al rodeo', detalle: nota ?? 'No era el que salió', tono: 'bien' as Tono }
          if (dato(d, 'resuelve')) return { ...base, titulo: 'Identificada', detalle: 'Era éste el que salió', tono: 'neutro' as Tono }
          if (dato(d, 'correccion')) return { ...base, titulo: 'Se corrigieron datos', detalle: correcciones(dato(d, 'correccion')), tono: 'neutro' as Tono }
          if (dato(d, 'deshace')) return { ...base, titulo: 'Se sacó la caravana', detalle: nota ?? 'Se deshizo la carga de la planilla', tono: 'neutro' as Tono }
          return { ...base, titulo: 'Nota', detalle: nota, tono: 'neutro' as Tono }
        default:
          return { ...base, titulo: e.tipo.charAt(0).toUpperCase() + e.tipo.slice(1), detalle: nota, tono: 'neutro' as Tono }
      }
    })
}

const NOMBRE_DATO: Record<string, string> = { categoria: 'Qué es', fecha_nacimiento: 'Nació', raza: 'Raza', pelaje: 'Pelaje' }
const valorDato = (k: string, v: unknown) => {
  const t = texto(v)
  if (!t) return 'sin dato'
  if (k === 'categoria') return categoriaLabel[t as Categoria] ?? t
  if (k === 'fecha_nacimiento') return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`
  return t
}
/** «Qué es: Vaquillona → Vaca · Raza: sin dato → Angus» */
function correcciones(c: unknown): string | null {
  if (!c || typeof c !== 'object') return null
  return Object.entries(c as Record<string, { antes?: unknown; despues?: unknown }>)
    .map(([k, v]) => `${NOMBRE_DATO[k] ?? k}: ${valorDato(k, v?.antes)} → ${valorDato(k, v?.despues)}`)
    .join(' · ')
}

/** Los rasgos de arriba de la ficha, sólo los que se saben: «3 años», «Angus negro». */
export function rasgosDelAnimal(a: { fecha_nacimiento: string | null; raza: string | null; pelaje: string | null }, hoy = new Date()): { nombre: string; valor: string }[] {
  const r: { nombre: string; valor: string }[] = []
  const edad = edadTexto(a.fecha_nacimiento, hoy)
  if (edad) r.push({ nombre: 'Edad', valor: edad.charAt(0).toUpperCase() + edad.slice(1) })
  const raza = [texto(a.raza), texto(a.pelaje)?.toLowerCase()].filter(Boolean).join(' ')
  if (raza) r.push({ nombre: texto(a.raza) ? 'Raza' : 'Pelaje', valor: raza.charAt(0).toUpperCase() + raza.slice(1) })
  return r
}

/** «Desde el 12 de septiembre. Venía del 3A.»: desde cuándo está en su potrero. */
export function desdeCuando(eventos: EventoFicha[], potrero: string | null): string | null {
  const llego = eventos
    .filter((e) => e.tipo === 'movimiento' && texto(dato(e.datos, 'potrero_destino')) === potrero)
    .sort((x, y) => y.fecha.localeCompare(x.fecha))[0]
  const alta = eventos.filter((e) => e.tipo === 'alta').sort((x, y) => x.fecha.localeCompare(y.fecha))[0]
  const f = llego?.fecha ?? alta?.fecha
  if (!f) return null
  const de = llego ? texto(dato(llego.datos, 'potrero_origen')) : null
  return `Desde el ${Number(f.slice(8, 10))} de ${MES[Number(f.slice(5, 7)) - 1]}${f.slice(0, 4) !== String(new Date().getFullYear()) ? ` de ${f.slice(0, 4)}` : ''}.${de ? ` Venía del ${de}.` : ''}`
}

/** «Ternero macho», «Vaca»: el título grande de la ficha. */
export function tituloDelAnimal(categoria: Categoria | null, sexo: 'macho' | 'hembra' | null): string {
  if (!categoria) return 'Sin categoría'
  const base = categoriaLabel[categoria]
  return (categoria === 'ternero' || categoria === 'cordero') && sexo === 'macho' ? `${base} macho` : base
}
