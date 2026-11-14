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

/** Dónde se pide el pronóstico: el centro de un campo y su nombre. */
export type UbicacionClima = { nombre: string; lat: number; lon: number }

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
  /** Máxima y mínima del día (°C). */
  max: number
  min: number
  /** Probabilidad de lluvia del día (%) y acumulado pronosticado (mm). */
  lluviaProb: number
  lluviaMm: number
  /** Helada prevista: mínima ≤ 3 °C. */
  helada: boolean
  /** Viento ahora, km/h a 10 m. */
  viento: number
  /** Es de día (para la escena). */
  dia: boolean
}

export type DiaPronostico = {
  /** YYYY-MM-DD. */
  fecha: string
  code: number
  descripcion: string
  max: number
  min: number
  lluviaProb: number
  lluviaMm: number
  helada: boolean
}

/** El tiempo de UN campo en una sola foto: ahora, los 7 días desde hoy y la lluvia de los días pasados. */
export type TiempoDelCampo = {
  /** Sin `lugar`: lo pone el hook con el nombre del campo. */
  ahora: Omit<Clima, 'lugar'>
  /** Hoy y los 6 días que siguen. */
  dias: DiaPronostico[]
  /** Los días anteriores a hoy, con lo que llovió según el modelo (mm). */
  pasado: { fecha: string; mm: number }[]
}

/** Los días que se piden hacia atrás: alcanzan para la lluvia del último mes (30 días que terminan ayer). */
export const DIAS_PASADOS = 31

type RespuestaOpenMeteo = {
  current: { temperature_2m: number; weather_code: number; wind_speed_10m?: number; is_day?: number }
  daily: {
    time: string[]
    weather_code: (number | null)[]
    temperature_2m_max: (number | null)[]
    temperature_2m_min: (number | null)[]
    precipitation_probability_max: (number | null)[]
    precipitation_sum: (number | null)[]
  }
}

/**
 * Arma el tiempo del campo con la respuesta de Open-Meteo. Pura: se prueba sin red.
 * `hoy` (YYYY-MM-DD, hora argentina) separa el pasado del pronóstico; un día sin
 * dato del modelo no se inventa: se saca del pasado.
 */
export function leerTiempo(j: RespuestaOpenMeteo, hoy: string): TiempoDelCampo {
  const d = j.daily
  const todos: DiaPronostico[] = d.time.map((fecha, i) => {
    const code = d.weather_code[i] ?? 0
    const min = d.temperature_2m_min[i] ?? 0
    return {
      fecha,
      code,
      descripcion: WMO[code] ?? '—',
      max: Math.round(d.temperature_2m_max[i] ?? 0),
      min: Math.round(min),
      lluviaProb: Math.round(d.precipitation_probability_max[i] ?? 0),
      lluviaMm: d.precipitation_sum[i] ?? 0,
      helada: min <= 3,
    }
  })
  const dias = todos.filter((x) => x.fecha >= hoy)
  const pasado = d.time.flatMap((fecha, i) => (fecha < hoy && d.precipitation_sum[i] != null ? [{ fecha, mm: d.precipitation_sum[i]! }] : []))
  const hoyDia = dias[0]
  const code = j.current.weather_code
  return {
    ahora: {
      temp: Math.round(j.current.temperature_2m),
      code,
      descripcion: WMO[code] ?? '—',
      max: hoyDia?.max ?? 0,
      min: hoyDia?.min ?? 0,
      lluviaProb: hoyDia?.lluviaProb ?? 0,
      lluviaMm: hoyDia?.lluviaMm ?? 0,
      helada: hoyDia?.helada ?? false,
      viento: Math.round(j.current.wind_speed_10m ?? 0),
      dia: j.current.is_day !== 0,
    },
    dias,
    pasado,
  }
}

/** Hoy en la Argentina, YYYY-MM-DD (el mismo huso con el que Open-Meteo arma los días). */
export const hoyEnArgentina = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

/**
 * El tiempo de UN campo vía Open-Meteo (gratis, sin key), en UNA consulta: el
 * clima de ahora, el pronóstico de la semana y la lluvia del último mes salen
 * de la misma corrida del modelo, así nunca se contradicen. Para la Argentina,
 * el modelo automático de Open-Meteo es el ECMWF IFS de 9 km (verificado el
 * 10/10/2026: da los mismos valores que pedirlo explícito), el de mejor
 * desempeño en la región pampeana; no se fija para conservar el respaldo si ese
 * modelo falla.
 */
export async function getTiempoDelCampo(u: { lat: number; lon: number }): Promise<TiempoDelCampo> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${u.lat}&longitude=${u.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
    `&past_days=${DIAS_PASADOS}&forecast_days=7&timezone=America/Argentina/Buenos_Aires`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  return leerTiempo((await res.json()) as RespuestaOpenMeteo, hoyEnArgentina())
}

export type Gordo = {
  /** $ por kg vivo. */
  valor: number
  /** Fecha del precio (YYYY-MM-DD). */
  fecha: string
}

/**
 * Fuente de referencia para el precio del gordo (carga manual). URL directa
 * a la tabla diaria "Precios por Categoría" del Mercado Agroganadero de
 * Cañuelas (el mercado de referencia del país): cae directo en el precio
 * por categoría en $/kg. Cambiá esto si usás otra fuente (tu consignatario,
 * ROSGAN, etc.).
 */
export const GORDO_FUENTE = {
  nombre: 'Mercado de Cañuelas',
  url: 'https://www.mercadoagroganadero.com.ar/dll/hacienda1.dll/haciinfo000502',
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

export type NovilloCanuelas = {
  /** $ por kg vivo, promedio general de NOVILLOS del último remate. */
  valor: number
  /** Fecha del remate (YYYY-MM-DD). */
  fecha: string
  fuente: string
  categorias: { nombre: string; promedio: number; cabezas: number }[]
}

/**
 * Precio del novillo de Cañuelas, traído por la edge function
 * `precio-novillo` (la página no manda CORS). Es la referencia automática:
 * el ticker lo muestra y el alquiler pactado en kilos lo usa sin preguntar.
 * La carga manual (`cargarGordo`) queda para quien usa otra referencia (su
 * consignatario, ROSGAN).
 */
export async function getNovilloCanuelas(): Promise<NovilloCanuelas> {
  const { data, error } = await supabase.functions.invoke<NovilloCanuelas | { error: string }>('precio-novillo', {
    method: 'GET',
  })
  if (error) throw new Error(error.message)
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error ?? 'Sin precio')
  return data
}
