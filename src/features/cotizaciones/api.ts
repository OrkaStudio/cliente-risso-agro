/**
 * Cotizaciones externas para el ticker del Modo Oficina.
 * Fuentes públicas, gratuitas y sin auth — se llaman directo desde el browser.
 */

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
