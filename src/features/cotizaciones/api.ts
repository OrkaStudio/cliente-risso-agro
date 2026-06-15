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

export type Gordo = {
  /** $ por kg vivo. */
  valor: number
  /** Fecha del precio (YYYY-MM-DD). */
  fecha: string
}

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
