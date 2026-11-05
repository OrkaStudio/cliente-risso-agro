import type { NombreIcono } from '@/components/tropero/iconos-svg'
import type { Membresia } from './use-empresa'

/**
 * Lo que ve cada persona (Lau, 05/11): el dueño ve todo; a cada invitado el
 * dueño le elige las secciones, al invitarlo y después. Configuración es
 * sólo del dueño. La base niega la plata a quien no tiene «plata» ni «agenda».
 */
export type Seccion = 'inicio' | 'hacienda' | 'campos' | 'plata' | 'agenda'

export const SECCIONES: { id: Seccion; texto: string; ruta: string; icono: NombreIcono; queVe: string }[] = [
  { id: 'inicio', texto: 'Inicio', ruta: '/', icono: 'Inicio', queVe: 'El resumen del día' },
  { id: 'hacienda', texto: 'Hacienda', ruta: '/hacienda', icono: 'Hacienda', queVe: 'Los animales, entradas y salidas' },
  { id: 'campos', texto: 'Campos', ruta: '/campos', icono: 'Campos', queVe: 'El mapa, los potreros y las labores' },
  { id: 'plata', texto: 'Plata', ruta: '/analitica', icono: 'Plata', queVe: 'Lo que entra y sale, y qué rinde' },
  { id: 'agenda', texto: 'Agenda', ruta: '/agenda', icono: 'Agenda', queVe: 'Los pagos y cobros que vencen' },
]

export type Rol = 'encargado' | 'peon' | 'vet'
export const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'encargado', texto: 'Encargado' },
  { valor: 'peon', texto: 'Peón' },
  { valor: 'vet', texto: 'Veterinario' },
]
export const nombreRol = (r: string) => (r === 'dueno' ? 'Dueño' : (ROLES.find((x) => x.valor === r)?.texto ?? r))

/** Un punto de partida al invitar según el rol; el dueño lo cambia como quiera. */
export function seccionesSugeridas(rol: Rol): Seccion[] {
  return rol === 'vet' ? ['hacienda'] : ['inicio', 'hacienda', 'campos']
}

export const esDueno = (m: Membresia | null | undefined) => m?.rol === 'dueno'

/** ¿Esta persona ve esa sección? El dueño, todo; sin membresía todavía, nada se esconde. */
export function puedeVer(m: Membresia | null | undefined, s: Seccion): boolean {
  // Una membresía guardada de antes (sin señal) no trae las secciones: no se
  // esconde nada hasta que llegue la de la base, que igual niega la plata.
  if (!m || esDueno(m) || m.secciones === undefined || m.secciones === null) return true
  return m.secciones.includes(s)
}

/** Ve algo de plata (para el Inicio: los pagos y cobros). */
export const veePlata = (m: Membresia | null | undefined) => puedeVer(m, 'plata') || puedeVer(m, 'agenda')

/** La sección de una ruta de la Oficina (null si no es de ninguna, como Configuración). */
export function seccionDeRuta(path: string): Seccion | null {
  if (path === '/' || path === '') return 'inicio'
  // El Modo Campo del celular: su Plata también es plata.
  if (path.startsWith('/campo/plata')) return 'plata'
  const s = SECCIONES.find((x) => x.ruta !== '/' && (path === x.ruta || path.startsWith(`${x.ruta}/`)))
  return s?.id ?? null
}

/** A dónde va alguien que entra a algo que no ve: su primera sección. */
export function primeraRuta(m: Membresia | null | undefined): string {
  return SECCIONES.find((s) => puedeVer(m, s.id))?.ruta ?? '/'
}
