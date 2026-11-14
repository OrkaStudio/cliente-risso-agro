import type { NombreIcono } from '@/components/tropero/iconos-svg'
import type { Membresia } from './use-empresa'

/**
 * Lo que ve y hace cada persona (Lau, 13/11; spec «Permisos por persona»).
 * El dueño tiene todo. A cada invitado el dueño le elige, sección por sección,
 * un nivel: no ve, ve, ve y carga, o solo manda (por WhatsApp). No hay roles
 * con permisos armados: el rol es sólo cómo se lo nombra. La base aplica lo
 * mismo (migración 20261113130000), así que esto sólo decide qué se muestra.
 */
export type Seccion = 'inicio' | 'hacienda' | 'campos' | 'plata' | 'agenda'

export const SECCIONES: { id: Seccion; texto: string; ruta: string; icono: NombreIcono; queVe: string }[] = [
  { id: 'inicio', texto: 'Inicio', ruta: '/', icono: 'Inicio', queVe: 'El resumen del día' },
  { id: 'hacienda', texto: 'Hacienda', ruta: '/hacienda', icono: 'Hacienda', queVe: 'Los animales, entradas y salidas' },
  { id: 'campos', texto: 'Campos', ruta: '/campos', icono: 'Campos', queVe: 'El mapa, los potreros y las labores' },
  { id: 'plata', texto: 'Plata', ruta: '/analitica', icono: 'Plata', queVe: 'Lo que entra y sale, y qué rinde' },
  { id: 'agenda', texto: 'Agenda', ruta: '/agenda', icono: 'Agenda', queVe: 'Los pagos y cobros que vencen' },
]

/** Las secciones que el dueño habilita. El Inicio lo tienen todos; la Agenda son montos: va con la Plata. */
export type SeccionConPermiso = 'hacienda' | 'campos' | 'plata'
export const SECCIONES_CON_PERMISO: { id: SeccionConPermiso; texto: string; icono: NombreIcono; queHay: string }[] = [
  { id: 'hacienda', texto: 'Hacienda', icono: 'Hacienda', queHay: 'Los animales, la manga, entradas y salidas' },
  { id: 'campos', texto: 'Campos', icono: 'Campos', queHay: 'El mapa, los potreros, lluvias y recorridas' },
  { id: 'plata', texto: 'Plata y Agenda', icono: 'Plata', queHay: 'Gastos, cobros, lo que rinde y lo que vence' },
]

export type Nivel = 'no' | 've' | 'carga' | 'solo_manda'
export type Niveles = Partial<Record<SeccionConPermiso, Nivel>>

/** Cómo se lo explicamos al productor (spec, «Los niveles»). */
export const NIVELES: { id: Nivel; texto: string; explica: string }[] = [
  { id: 'no', texto: 'No ve', explica: 'No le aparece en la app y el bot no le contesta sobre esto.' },
  { id: 've', texto: 'Ve', explica: 'Mira, pero no puede cambiar nada.' },
  { id: 'carga', texto: 'Ve y carga', explica: 'Mira y anota. Lo que carga queda con su nombre.' },
  { id: 'solo_manda', texto: 'Solo manda', explica: 'Te manda novedades por WhatsApp, pero no ve lo que hay ni lo que cargaron otros.' },
]
export const nombreNivel = (n: Nivel) => NIVELES.find((x) => x.id === n)!.texto

/** Los que se tocan; cualquier otro lo escribe el dueño («Contador») y se guarda tal cual. Sólo nombran. */
export type RolConocido = 'encargado' | 'peon' | 'vet'
export type Rol = RolConocido | (string & {})
export const ROLES: { valor: RolConocido; texto: string }[] = [
  { valor: 'encargado', texto: 'Encargado' },
  { valor: 'peon', texto: 'Peón' },
  { valor: 'vet', texto: 'Veterinario' },
]
export const nombreRol = (r: string) => (r === 'dueno' ? 'Dueño' : (ROLES.find((x) => x.valor === r)?.texto ?? r))

export const esDueno = (m: Membresia | null | undefined) => m?.rol === 'dueno'

/** La sección con permiso de una sección de la app (la Agenda es plata; el Inicio, de todos). */
const permisoDe = (s: Seccion): SeccionConPermiso | null => (s === 'inicio' ? null : s === 'agenda' ? 'plata' : s)

/** El nivel de esta persona en la sección. El dueño, todo; sin membresía todavía, nada se esconde. */
export function nivelDe(m: Membresia | null | undefined, s: SeccionConPermiso): Nivel {
  // Una membresía guardada de antes (sin señal) no trae los niveles: no se
  // esconde nada hasta que llegue la de la base, que igual niega lo que no corresponde.
  if (!m || esDueno(m) || !m.niveles) return 'carga'
  return m.niveles[s] ?? 'no'
}

/** ¿Esta persona ve esa sección? El Inicio, todos (filtrado por lo que cada uno ve). */
export function puedeVer(m: Membresia | null | undefined, s: Seccion): boolean {
  const p = permisoDe(s)
  if (!p) return true
  const n = nivelDe(m, p)
  return n === 've' || n === 'carga'
}

/** ¿Puede cargar y corregir desde la app? «Solo manda» carga sólo por WhatsApp. */
export function puedeCargar(m: Membresia | null | undefined, s: Seccion): boolean {
  const p = permisoDe(s)
  return p ? nivelDe(m, p) === 'carga' : true
}

/** Ve la plata (para el Inicio: los pagos y cobros). */
export const veePlata = (m: Membresia | null | undefined) => puedeVer(m, 'plata')

/** En una frase, lo que va a poder hacer: «Ve y carga la Hacienda y ve los Campos. No ve la Plata y Agenda.» */
export function resumenNiveles(n: Niveles): string {
  const art: Record<SeccionConPermiso, string> = { hacienda: 'la Hacienda', campos: 'los Campos', plata: 'la Plata y la Agenda' }
  const grupo = (nivel: Nivel) => SECCIONES_CON_PERMISO.filter((s) => n[s.id] === nivel).map((s) => art[s.id])
  const y = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : (xs[0] ?? ''))
  const partes = [
    grupo('carga').length ? `ve y carga ${y(grupo('carga'))}` : '',
    grupo('ve').length ? `ve ${y(grupo('ve'))}` : '',
    grupo('solo_manda').length ? `manda por WhatsApp lo de ${y(grupo('solo_manda'))}` : '',
  ].filter(Boolean)
  const no = grupo('no')
  const frase = partes.length ? `${y(partes).charAt(0).toUpperCase()}${y(partes).slice(1)}.` : ''
  return [frase, no.length ? `No ve ${y(no)}.` : ''].filter(Boolean).join(' ')
}

/** La sección de una ruta de la Oficina (null si no es de ninguna, como Configuración). */
export function seccionDeRuta(path: string): Seccion | null {
  if (path === '/' || path === '') return 'inicio'
  // El Modo Campo del celular: su Plata también es plata.
  if (path.startsWith('/campo/plata')) return 'plata'
  const s = SECCIONES.find((x) => x.ruta !== '/' && (path === x.ruta || path.startsWith(`${x.ruta}/`)))
  return s?.id ?? null
}

/**
 * Lo que se hace en el Modo Campo del celular es cargar: la recorrida es de
 * Campos, la manga y el lector de Hacienda, y anotar plata de la Plata.
 */
export function cargaDeRuta(path: string): Seccion | null {
  if (path.startsWith('/campo/recorrida')) return 'campos'
  if (path.startsWith('/campo/manga') || path.startsWith('/campo/lector')) return 'hacienda'
  if (path.startsWith('/campo/plata')) return 'plata'
  return null
}

/** A dónde va alguien que entra a algo que no ve: su primera sección (el Inicio, que lo tienen todos). */
export function primeraRuta(m: Membresia | null | undefined): string {
  return SECCIONES.find((s) => puedeVer(m, s.id))?.ruta ?? '/'
}
