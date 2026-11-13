import type { NombreIcono } from '@/components/tropero/icono'
import { plural, type Resumen } from '@/features/guia/estado'
import type { CampoMapa } from '@/features/mapa/reglas'
import { esDueno, puedeCargar } from '@/features/empresa/secciones'
import type { Membresia } from '@/features/empresa/use-empresa'

// Lo que el asistente notó en los campos del productor (Lau, 28/10: «que venga
// con lo que ya sabe»). Sale de datos que la app ya tiene: nada se inventa ni se
// le pregunta. Cada aviso dice qué falta, dónde y lleva a hacerlo.

export type Aviso = {
  id: string
  /** El ícono de la marca según de qué se trata. */
  icono: NombreIcono
  titulo: string
  detalle: string
  /** A dónde lleva y qué botón marca (data-guia). Sin acción: se hace desde el celular. */
  accion: { texto: string; ruta: string; ancla: string | null } | null
}

export type PasoProgreso = { id: string; texto: string; hecho: boolean }

/** Campos en los que no hay hacienda, sin contar los que son de agricultura. */
function sinHacienda(campos: CampoMapa[]): CampoMapa[] {
  return campos.filter((c) => c.potreros.length > 0 && c.potreros.every((p) => p.cabezas === 0) && !c.potreros.some((p) => p.tipo === 'sembrado'))
}

/** «La Loma», «La Loma y El Bajo», «La Loma, El Bajo y 3 campos más». */
function lista(nombres: string[]): string {
  if (nombres.length > 3) return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} campos más`
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

export function avisosDe(r: Resumen, campos: CampoMapa[], mapaPendiente: boolean): Aviso[] {
  const avisos: Aviso[] = []
  // Sin el mapa no se abre el resto: es lo único que importa.
  if (mapaPendiente) {
    const primero = r.sinContorno[0]
    avisos.push({
      id: 'mapa',
      icono: 'Campos',
      titulo: primero ? `Falta ubicar ${primero.nombre} en el mapa` : 'Faltan los potreros en el mapa',
      detalle: 'Con el mapa armado se abre toda la app.',
      accion: { texto: 'Seguir con el mapa', ruta: '/campos', ancla: null },
    })
    return avisos
  }
  const vacios = sinHacienda(campos)
  if (vacios.length > 0) {
    avisos.push({
      id: 'sin-hacienda',
      icono: 'Hacienda',
      titulo: `${lista(vacios.map((c) => c.nombre))} ${vacios.length === 1 ? 'no tiene' : 'no tienen'} hacienda cargada`,
      detalle: 'Si tiene animales, cargalos y aparecen en su potrero.',
      accion: { texto: 'Cargar la hacienda', ruta: '/hacienda', ancla: 'hacienda-entraron' },
    })
  }
  if (r.sinPotrero > 0) {
    avisos.push({
      id: 'sin-potrero',
      icono: 'Vaca',
      titulo: `${plural(r.sinPotrero, 'animal', 'animales')} sin potrero`,
      detalle: 'Decí en qué potrero está cada uno y aparecen en el mapa.',
      accion: { texto: 'Ubicarlos', ruta: '/hacienda', ancla: null },
    })
  }
  for (const c of r.alquilerPendiente) {
    avisos.push({
      id: `alquiler-${c.id}`,
      icono: 'Plata',
      titulo: `Falta el alquiler de ${c.nombre}`,
      detalle: 'Como está en el contrato. Cada pago queda en la Agenda.',
      accion: { texto: 'Cargar el alquiler', ruta: '/analitica', ancla: 'analitica-alquiler' },
    })
  }
  if (r.recorridas === 0) {
    avisos.push({
      id: 'recorrida',
      icono: 'Recorrida',
      titulo: 'Todavía no recorriste ningún campo',
      detalle: 'Se hace desde el celular, en el campo: lo que veas queda en el mapa.',
      accion: null,
    })
  }
  return avisos
}

/** Cuánto del campo está armado en Troppero. El alquiler cuenta sólo si hay campos alquilados. */
export function progresoDe(r: Resumen, campos: CampoMapa[], mapaPendiente: boolean): PasoProgreso[] {
  return [
    { id: 'mapa', texto: 'Tus campos en el mapa', hecho: !mapaPendiente },
    { id: 'hacienda', texto: 'La hacienda cargada', hecho: !mapaPendiente && r.cabezas > 0 && sinHacienda(campos).length === 0 },
    { id: 'potreros', texto: 'Cada animal en su potrero', hecho: r.cabezas > 0 && r.sinPotrero === 0 },
    ...(r.alquilados > 0 ? [{ id: 'alquiler', texto: 'El alquiler cargado', hecho: r.alquilerPendiente.length === 0 }] : []),
    { id: 'recorrida', texto: 'La primera recorrida', hecho: r.recorridas > 0 },
  ]
}

/** Un aviso de puesta a punto es para quien puede resolverlo (permisos, 13/11): el mapa es del dueño. */
export function avisoPermitido(id: string, m: Membresia | null | undefined): boolean {
  if (id === 'mapa') return esDueno(m) || !m
  if (id === 'sin-hacienda' || id === 'sin-potrero') return puedeCargar(m, 'hacienda')
  if (id.startsWith('alquiler-')) return puedeCargar(m, 'plata')
  if (id === 'recorrida') return puedeCargar(m, 'campos')
  return true
}
