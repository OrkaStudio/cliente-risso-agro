// Permisos por persona en el bot (Lau, 13/11; spec del cerebro
// clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona).
//
// El dueño elige, sección por sección, qué puede hacer cada invitado:
// no ve, ve, ve y carga, o solo manda. La base ya lo hace cumplir (el bot lee y
// escribe como el usuario vinculado), pero sin esto el bot contestaría «no hay
// gastos» a quien no ve la plata: lo que no está habilitado se dice, no se
// disfraza de dato.

import type { TipoBorrador } from './tipos.ts'

export type Seccion = 'hacienda' | 'campos' | 'plata'
export type Nivel = 'no' | 've' | 'carga' | 'solo_manda'
/** null = el dueño: tiene todo. */
export type Niveles = Partial<Record<Seccion, Nivel>> | null

const SECCION: Record<TipoBorrador, Seccion | null> = {
  recorrida: 'campos',
  lluvia: 'campos',
  gasto: 'plata',
  consulta_hacienda: 'hacienda',
  consulta_lluvia: 'campos',
  consulta_vencimientos: 'plata',
  consulta_dias_potrero: 'hacienda',
  consulta_recorrida: 'campos',
  consulta_observacion: 'campos',
  consulta_novedades: 'campos',
  consulta_gastos: 'plata',
  // Las cargas propias por WhatsApp: cada uno ve lo suyo (la base filtra).
  consulta_cargas: null,
}

const QUE: Record<Seccion, string> = { hacienda: 'la hacienda', campos: 'los campos', plata: 'la plata' }
const MANEJA: Record<Seccion, string> = { hacienda: 'la maneja', campos: 'los maneja', plata: 'la maneja' }

export const nivelDe = (n: Niveles, s: Seccion): Nivel => (n === null ? 'carga' : (n[s] ?? 'no'))
export const veSeccion = (n: Niveles, s: Seccion) => ['ve', 'carga'].includes(nivelDe(n, s))
export const cargaSeccion = (n: Niveles, s: Seccion) => ['carga', 'solo_manda'].includes(nivelDe(n, s))
/** «Solo manda»: carga, pero no ve totales ni lo que cargaron otros. */
export const soloManda = (n: Niveles, s: Seccion) => nivelDe(n, s) === 'solo_manda'

export type Permiso = { ok: true } | { ok: false; texto: string }

/** ¿Puede pedir esto? Una consulta pide ver; una carga, cargar o mandar. */
export function permiso(n: Niveles, tipo: TipoBorrador): Permiso {
  const s = SECCION[tipo]
  if (!s) return { ok: true }
  const consulta = tipo.startsWith('consulta_')
  if (consulta ? veSeccion(n, s) : cargaSeccion(n, s)) return { ok: true }
  if (consulta && soloManda(n, s))
    return { ok: false, texto: `Podés mandarme lo de ${QUE[s]}, pero los totales y lo que cargaron otros los ve el dueño del campo.` }
  return {
    ok: false,
    texto: consulta
      ? `Eso no te lo puedo contestar: ${QUE[s]} ${MANEJA[s]} el dueño del campo. Si lo necesitás, pedile que te lo habilite.`
      : `No tenés habilitado cargar lo de ${QUE[s]}. Si lo necesitás, pedile al dueño del campo que te lo habilite.`,
  }
}

/** Cargar o borrar infraestructura (molinos, tranqueras…) es de Campos; borrar, sólo con «Ve y carga». */
export function permisoInfra(n: Niveles, accion: 'cargar' | 'borrar'): Permiso {
  const ok = accion === 'borrar' ? nivelDe(n, 'campos') === 'carga' : cargaSeccion(n, 'campos')
  return ok ? { ok: true } : { ok: false, texto: 'No tenés habilitado cargar lo de los campos. Si lo necesitás, pedile al dueño del campo que te lo habilite.' }
}

/**
 * Los comandos del piloto: ver problemas, tareas o la comparación de recorridas
 * pide ver Campos; reportar, resolver, asignar o llevar una sesión pide cargar
 * Campos. Corregir la última carga propia lo decide la base (lo suyo, sin revisar).
 */
export function permisoPiloto(n: Niveles, k: 'ajustar' | 'problemas' | 'tareas' | 'comparar' | 'incidencia' | 'resolver' | 'resolver_lugar' | 'tarea' | 'tarea_estado' | 'sesion'): Permiso {
  if (k === 'ajustar') return { ok: true }
  const ver = k === 'problemas' || k === 'tareas' || k === 'comparar'
  if (ver ? veSeccion(n, 'campos') : cargaSeccion(n, 'campos')) return { ok: true }
  return permiso(n, ver ? 'consulta_recorrida' : 'recorrida')
}
