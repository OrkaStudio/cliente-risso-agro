// Onboarding de Tropero: las reglas, sin React ni red (spec «Tropero para
// código», sección 2). Se prueban solas en modelo.test.ts.
import type { Database } from '@/lib/supabase/types'
import type { Uso } from '@/features/campos/use-campo-mapa'
import { especiePorCategoria, type Especie } from '@/features/hacienda/labels'

export type Categoria = Database['public']['Enums']['categoria_animal']
export type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
export type TipoCampo = Database['public']['Enums']['tipo_campo']

// ===== Lo que hay en un potrero (B4) =====

export type Contenido =
  | { tipo: 'hacienda'; cabezas: Partial<Record<Categoria, number>> }
  | { tipo: 'sembrado'; cultivo: string }
  /** `desde`: fecha aproximada, 'YYYY-MM-DD' en hora local. */
  | { tipo: 'descanso'; desde: string }

/** Los chips de cultivo de la 35 («Otro» abre un campo de texto). */
export const CULTIVOS = ['Trigo', 'Maíz', 'Soja', 'Girasol', 'Pastura', 'Verdeo'] as const

/** Atajos para «desde cuándo descansa» (la fecha es aproximada). */
export const ATAJOS_DESCANSO: { nombre: string; dias: number }[] = [
  { nombre: 'Hace una semana', dias: 7 },
  { nombre: 'Hace un mes', dias: 30 },
  { nombre: 'Hace dos meses', dias: 60 },
]

export type PotreroOnb = {
  id: string
  /** Como lo guarda la base: número + letra del campo (11B). */
  nombre: string
  hectareas: number
  contenido: Contenido | null
}

export type CampoOnb = {
  id: string
  nombre: string
  localidad: string
  provincia: string
  lat: number
  lon: number
  tipo: TipoCampo
  hectareas: number
  /** Índice del campo en la empresa: de ahí salen la letra (A, B…) y el color. */
  colorIdx: number
  potreros: PotreroOnb[]
}

export function cabezasDe(c: Contenido | null): number {
  if (!c || c.tipo !== 'hacienda') return 0
  return Object.values(c.cabezas).reduce((s, n) => s + (n ?? 0), 0)
}

/** Lo que va a la base por cada contenido: estado del ciclo, cultivo y descanso. */
export function estadoDe(c: Contenido): { estadoCiclo: EstadoCiclo; cultivo: string | null } {
  if (c.tipo === 'hacienda') return { estadoCiclo: 'ganadero', cultivo: null }
  if (c.tipo === 'sembrado') return { estadoCiclo: 'cultivo', cultivo: c.cultivo.trim() }
  return { estadoCiclo: 'descanso', cultivo: null }
}

/** Uso visual (los tres de toda la app) para calcular la actividad del campo. */
export function usoDe(c: Contenido): Uso {
  return c.tipo === 'hacienda' ? 'ganadero' : c.tipo === 'sembrado' ? 'agricola' : 'vacio'
}

/** Date → 'YYYY-MM-DD' en hora local (toISOString corre el día después de las 21). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** La fecha de hace N días, para los atajos de «desde cuándo descansa». */
export function haceDias(dias: number, hoy: Date): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias)
  return ymd(d)
}

/** «desde el 5/9» — como se lee en el dibujo del potrero. */
export function desdeCorto(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `desde el ${d}/${m}`
}

/** El ícono del set de Tropero para cada especie. */
export const ICONO_ESPECIE = { bovino: 'Vaca', ovino: 'Oveja', equino: 'Caballo' } as const satisfies Record<Especie, string>

/** Las especies que hay en un potrero (para dibujar un ícono por cada una). */
export function especiesDe(c: Contenido | null): Especie[] {
  if (!c || c.tipo !== 'hacienda') return []
  const hay = new Set<Especie>()
  for (const [cat, n] of Object.entries(c.cabezas) as [Categoria, number][]) if (n > 0) hay.add(especiePorCategoria[cat])
  return (['bovino', 'ovino', 'equino'] as const).filter((e) => hay.has(e))
}

/** Falta algo para poder guardar este potrero (B4). */
export function faltaEnContenido(c: Contenido | null): string | null {
  if (!c) return 'Elegí qué hay: hacienda, sembrado o descanso.'
  if (c.tipo === 'sembrado' && !c.cultivo.trim()) return 'Elegí qué está sembrado.'
  if (c.tipo === 'descanso' && !c.desde) return 'Elegí desde cuándo descansa, aunque sea aproximado.'
  return null
}

// ===== Hectáreas de los potreros contra las del campo (B3) =====

export type Suma =
  | { estado: 'incompleto' }
  | { estado: 'cierran'; suma: number }
  | { estado: 'sobran'; suma: number; diferencia: number }
  | { estado: 'faltan'; suma: number; diferencia: number }

const redondear = (n: number) => Math.round(n * 10) / 10

/** Compara la suma de los potreros con el campo. Con una fila sin hectáreas: incompleto. */
export function sumaDePotreros(hectareasCampo: number, filas: (number | null)[]): Suma {
  if (filas.length === 0 || filas.some((h) => h === null || !(h > 0))) return { estado: 'incompleto' }
  const suma = redondear(filas.reduce<number>((s, h) => s + (h ?? 0), 0))
  const diferencia = redondear(suma - hectareasCampo)
  if (Math.abs(diferencia) < 0.05) return { estado: 'cierran', suma }
  if (diferencia > 0) return { estado: 'sobran', suma, diferencia }
  return { estado: 'faltan', suma, diferencia: -diferencia }
}

/** 353 → «353»; 21,5 → «21,5». */
export function ha(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

/** Lo que se escribe en hectáreas: número con coma o punto. */
export function leerHectareas(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ===== Pasos =====

export type Paso =
  | { etapa: 'empresa' }
  | { etapa: 'campo'; campoId?: string }
  | { etapa: 'potreros'; campoId: string }
  | { etapa: 'que-hay'; campoId: string; indice: number }
  | { etapa: 'otro' }
  | { etapa: 'cierre' }

/** «Paso N de 4»: empresa, campo, potreros, qué hay. «Otro campo» sigue en el 4. */
export function numeroDePaso(p: Paso): number | null {
  switch (p.etapa) {
    case 'empresa':
      return 1
    case 'campo':
      return 2
    case 'potreros':
      return 3
    case 'que-hay':
    case 'otro':
      return 4
    case 'cierre':
      return null
  }
}

/** Después de guardar qué hay en un potrero: el siguiente, o «¿Tenés otro campo?». */
export function despuesDePotrero(campo: CampoOnb, indice: number): Paso {
  return indice + 1 < campo.potreros.length
    ? { etapa: 'que-hay', campoId: campo.id, indice: indice + 1 }
    : { etapa: 'otro' }
}

/** El botón «Atrás» de cada paso: al anterior, con lo cargado intacto. */
export function pasoAnterior(p: Paso, campos: CampoOnb[]): Paso | null {
  switch (p.etapa) {
    case 'empresa':
      return null
    case 'campo':
      // Corrigiendo un campo ya cargado se vuelve a sus potreros; uno nuevo,
      // a «¿Tenés otro campo?» si ya hay alguno (la empresa ya está creada).
      if (p.campoId) return { etapa: 'potreros', campoId: p.campoId }
      return campos.length > 0 ? { etapa: 'otro' } : null
    case 'potreros':
      return { etapa: 'campo', campoId: p.campoId }
    case 'que-hay':
      return p.indice > 0
        ? { etapa: 'que-hay', campoId: p.campoId, indice: p.indice - 1 }
        : { etapa: 'potreros', campoId: p.campoId }
    case 'otro': {
      const ultimo = campos.at(-1)
      return ultimo && ultimo.potreros.length > 0
        ? { etapa: 'que-hay', campoId: ultimo.id, indice: ultimo.potreros.length - 1 }
        : null
    }
    case 'cierre':
      return { etapa: 'otro' }
  }
}

/**
 * Sin progreso guardado en este equipo (entró desde otro celular o compu):
 * dónde retomar con lo que ya hay en la base.
 */
export function pasoDesdeLaBase(campos: CampoOnb[]): Paso {
  if (campos.length === 0) return { etapa: 'campo' }
  const ultimo = campos.at(-1)!
  if (ultimo.potreros.length === 0) return { etapa: 'potreros', campoId: ultimo.id }
  const sinContenido = ultimo.potreros.findIndex((p) => p.contenido === null)
  if (sinContenido >= 0) return { etapa: 'que-hay', campoId: ultimo.id, indice: sinContenido }
  return { etapa: 'otro' }
}

// ===== Totales (el dibujo y el cierre) =====

export function totales(campos: CampoOnb[]): { hectareas: number; potreros: number; cabezas: number } {
  return {
    hectareas: redondear(campos.reduce((s, c) => s + c.hectareas, 0)),
    potreros: campos.reduce((s, c) => s + c.potreros.length, 0),
    cabezas: campos.reduce((s, c) => s + c.potreros.reduce((t, p) => t + cabezasDe(p.contenido), 0), 0),
  }
}

/** Letra del campo según su orden en la empresa: 0 → A, 1 → B… */
export function letraDeCampo(colorIdx: number): string {
  return String.fromCharCode(65 + colorIdx)
}

/**
 * Cómo va a quedar el nombre de cada potrero mientras se escriben (B3): el
 * número que pusieron + la letra del campo; sin número, el siguiente libre,
 * igual que hace la base (trigger potrero_asignar_nombre).
 */
export function nombresPrevistos(numeros: string[], letra: string): string[] {
  const usados = new Set(numeros.map((n) => parseInt(n.replace(/\D/g, ''), 10)).filter((n) => n > 0))
  let siguiente = 0
  return numeros.map((n) => {
    const propio = parseInt(n.replace(/\D/g, ''), 10)
    if (propio > 0) return `${propio}${letra}`
    do siguiente++
    while (usados.has(siguiente))
    usados.add(siguiente)
    return `${siguiente}${letra}`
  })
}

/** El número que toma un potrero nuevo: el siguiente al más alto usado. */
export function siguienteNumero(numeros: string[]): string {
  const usados = numeros.map((n) => parseInt(n.replace(/\D/g, ''), 10)).filter((n) => n > 0)
  return String((usados.length ? Math.max(...usados) : 0) + 1)
}

/** Las filas cuyo nombre se repite con otra (B3 no deja guardar así). */
export function filasRepetidas(nombres: string[]): Set<number> {
  const vistos = new Map<string, number[]>()
  nombres.forEach((n, i) => vistos.set(n, [...(vistos.get(n) ?? []), i]))
  return new Set([...vistos.values()].filter((is) => is.length > 1).flat())
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en'])

/**
 * Nombres propios (empresa, campo) con mayúscula, como se escriben:
 * «la porteña» → «La Porteña», «estancia de los pinos» → «Estancia de los Pinos».
 * La primera palabra siempre va con mayúscula; las preposiciones y artículos
 * del medio, no. Lo que ya viene en mayúscula se respeta (siglas como «SRL»).
 */
export function nombrePropio(texto: string): string {
  return texto.replace(/[^\s]+/g, (p, i: number) => {
    if (i > 0 && MINUSCULAS.has(p.toLowerCase())) return p.toLowerCase()
    return p.charAt(0).toLocaleUpperCase('es-AR') + p.slice(1)
  })
}

/** Días entre la fecha guardada y hoy (para «descansa hace 44 días»). */
export function diasDesde(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.split('-').map(Number)
  const desde = new Date(a!, m! - 1, d!)
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((h.getTime() - desde.getTime()) / 86_400_000))
}
