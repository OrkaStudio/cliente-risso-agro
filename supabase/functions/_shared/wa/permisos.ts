import type { TipoBorrador } from './tipos.ts'

export type Seccion = 'hacienda' | 'campos' | 'plata'
type Nivel = 'no' | 've' | 'carga' | 'solo_manda'
export type PermisosWhatsApp = { dueno: boolean; niveles: Record<Seccion, Nivel> }
export type MembresiaWhatsApp = { rol: string | null; niveles: unknown; secciones: unknown; acceso: string | null }

const secciones: Seccion[] = ['hacienda', 'campos', 'plata']
const NO_PUEDE = { hacienda: 'no', campos: 'no', plata: 'no' } as const

// El dueño define cada nivel por separado. El nombre del invitado no otorga acceso.
// La conversión de secciones previas coincide con 20261113130000_permisos_por_nivel.sql.
export function permisosDe(m: MembresiaWhatsApp): PermisosWhatsApp {
  if (m.rol === 'dueno') return { dueno: true, niveles: { hacienda: 'carga', campos: 'carga', plata: 'carga' } }
  const niveles: Record<Seccion, Nivel> = { ...NO_PUEDE }
  const actuales = m.niveles && typeof m.niveles === 'object' && !Array.isArray(m.niveles) ? m.niveles as Record<string, unknown> : null
  const previas = !actuales && Array.isArray(m.secciones) ? m.secciones : []
  for (const s of secciones) {
    const n = actuales ? actuales[s] : previas.includes(s) ? 'carga' : s === 'plata' && previas.includes('agenda') ? 've' : 'no'
    if (n === 'solo_manda' || (m.acceso !== 'whatsapp' && (n === 've' || n === 'carga'))) niveles[s] = n
  }
  return { dueno: false, niveles }
}

export function puedeVer(p: PermisosWhatsApp | undefined, s: Seccion): boolean {
  return p?.niveles[s] === 've' || p?.niveles[s] === 'carga'
}

export function puedeMandar(p: PermisosWhatsApp | undefined, s: Seccion): boolean {
  return p?.niveles[s] === 'carga' || p?.niveles[s] === 'solo_manda'
}

export function puedeVerTodo(p: PermisosWhatsApp | undefined): boolean {
  return secciones.every(s => puedeVer(p, s))
}

export function seccionDe(tipo: TipoBorrador): Seccion | null {
  switch (tipo) {
    case 'nota':
    case 'consulta_cargas': return null
    case 'gasto':
    case 'consulta_vencimientos':
    case 'consulta_gastos': return 'plata'
    case 'consulta_hacienda':
    case 'consulta_dias_potrero': return 'hacienda'
    case 'lluvia':
    case 'recorrida':
    case 'consulta_campos':
    case 'consulta_lluvia':
    case 'consulta_recorrida':
    case 'consulta_observacion':
    case 'consulta_novedades': return 'campos'
  }
}

const nombres = { hacienda: 'Hacienda', campos: 'Campos', plata: 'Plata y Agenda' }
export function accesoDenegado(s: Seccion, accion: 'ver' | 'cargar'): string {
  return accion === 'ver' ? 'Tu acceso a ' + nombres[s] + ' no permite esa consulta.'
    : 'Tu acceso a ' + nombres[s] + ' no permite registrar esa carga.'
}
