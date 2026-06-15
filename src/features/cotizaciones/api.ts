/**
 * Cotizaciones para el ticker del Modo Oficina.
 * - Dólar: fuente pública (dolarapi), se llama directo desde el browser.
 * - Gordo: carga manual del usuario (no hay API confiable), guardada en la
 *   tabla cotizacion_gordo con RLS por empresa.
 */
import { supabase } from '@/lib/supabase/client'

export type Dolar = {
  /** Casa de cambio (ej: "blue"). */
  casa: string
  nombre: string
  compra: number
  venta: number
  /** ISO de la última actualización informada por la fuente. */
  actualizado: string
}

/**
 * Dólar Blue vía dolarapi.com (https://dolarapi.com/v1/dolares/blue).
 * Respuesta: { moneda, casa, nombre, compra, venta, fechaActualizacion }.
 */
export async function getDolarBlue(): Promise<Dolar> {
  const res = await fetch('https://dolarapi.com/v1/dolares/blue')
  if (!res.ok) throw new Error(`dolarapi ${res.status}`)
  const j = (await res.json()) as {
    casa: string
    nombre: string
    compra: number
    venta: number
    fechaActualizacion: string
  }
  return {
    casa: j.casa,
    nombre: j.nombre,
    compra: j.compra,
    venta: j.venta,
    actualizado: j.fechaActualizacion,
  }
}

/**
 * Ubicación del campo principal para el clima. Provisional: la tabla
 * `campo` todavía no guarda coordenadas; cuando las tenga, esto sale de la
 * empresa/campo elegido. Por ahora, Las Flores (Buenos Aires).
 */
export const CAMPO_PRINCIPAL = {
  nombre: 'Las Flores',
  lat: -35.935128,
  lon: -59.335386,
} as const

/** Descripción corta por código WMO (open-meteo). */
const WMO: Record<number, string> = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna leve',
  53: 'Llovizna',
  55: 'Llovizna intensa',
  56: 'Llovizna helada',
  57: 'Llovizna helada',
  61: 'Lluvia leve',
  63: 'Lluvia',
  65: 'Lluvia intensa',
  66: 'Lluvia helada',
  67: 'Lluvia helada',
  71: 'Nieve leve',
  73: 'Nieve',
  75: 'Nieve intensa',
  77: 'Aguanieve',
  80: 'Chaparrones',
  81: 'Chaparrones',
  82: 'Chaparrones fuertes',
  85: 'Chaparrones de nieve',
  86: 'Chaparrones de nieve',
  95: 'Tormenta',
  96: 'Tormenta con granizo',
  99: 'Tormenta con granizo',
}

export type Clima = {
  /** Temperatura actual en °C, redondeada. */
  temp: number
  /** Código WMO (define el ícono). */
  code: number
  descripcion: string
  lugar: string
}

/**
 * Clima actual del campo principal vía Open-Meteo (gratis, sin key).
 */
export async function getClima(): Promise<Clima> {
  const { lat, lon, nombre } = CAMPO_PRINCIPAL
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&timezone=America/Argentina/Buenos_Aires`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  const j = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number }
  }
  const code = j.current.weather_code
  return {
    temp: Math.round(j.current.temperature_2m),
    code,
    descripcion: WMO[code] ?? '—',
    lugar: nombre,
  }
}

export type Gordo = {
  /** $ por kg vivo. */
  valor: number
  /** Fecha del precio (YYYY-MM-DD). */
  fecha: string
}

/**
 * Fuente de referencia para el precio del gordo (carga manual). El
 * Mercado Agroganadero de Cañuelas es el mercado de referencia del país.
 * Cambiá esto si usás otra fuente (tu consignatario, ROSGAN, etc.).
 */
export const GORDO_FUENTE = {
  nombre: 'Mercado de Cañuelas',
  url: 'https://www.mercadoagroganadero.com.ar/',
} as const

/**
 * Último precio del gordo de la empresa. null si nunca se cargó.
 * El scope por empresa lo garantiza la RLS de cotizacion_gordo.
 */
export async function getGordoActual(): Promise<Gordo | null> {
  const { data, error } = await supabase
    .from('cotizacion_gordo')
    .select('valor, fecha')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { valor: data.valor, fecha: data.fecha } : null
}

/**
 * Carga un nuevo precio del gordo. Queda en el historial; el ticker
 * muestra el último.
 */
export async function cargarGordo(input: {
  empresaId: string
  valor: number
  fecha: string
  nota?: string | null
}): Promise<void> {
  const { error } = await supabase.from('cotizacion_gordo').insert({
    empresa_id: input.empresaId,
    valor: input.valor,
    fecha: input.fecha,
    nota: input.nota ?? null,
  })
  if (error) throw new Error(error.message)
}
