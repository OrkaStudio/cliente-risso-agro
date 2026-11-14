import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { categoriaLabel } from '../labels'
import { muestraParaIa, type Columna, type Hoja, type Interpretacion, type OrdenFecha } from './planilla'

// La IA lee una MUESTRA de la planilla y dice cómo leerla (función
// `interpretar-planilla`). Lo que devuelve se controla acá: una columna que
// no existe, una categoría o un potrero que no son tuyos se descartan. Si
// falla, devuelve null y la planilla se lee por los títulos.

type Categoria = Database['public']['Enums']['categoria_animal']
type Respuesta = {
  hoja: number
  fila_titulos: number
  columnas: Partial<Record<Columna, number | null>>
  categorias: { texto: string; categoria: string | null }[]
  potreros: { texto: string; potrero: string | null }[]
  fecha: OrdenFecha | null
}

export async function interpretarConIa(hojas: Hoja[], potreros: { id: string; nombre: string; campo: string }[]): Promise<Interpretacion | null> {
  // El nombre del potrero se repite entre campos: a la IA le llega «1A (La Loma)» para que no los confunda.
  const repetidos = new Set(potreros.filter((p, i) => potreros.findIndex((q) => q.nombre === p.nombre) !== i).map((p) => p.nombre))
  const etiqueta = (p: { nombre: string; campo: string }) => (repetidos.has(p.nombre) ? `${p.nombre} (${p.campo})` : p.nombre)
  try {
    const { data, error } = await supabase.functions.invoke<Respuesta>('interpretar-planilla', {
      body: {
        hojas: muestraParaIa(hojas),
        categorias: (Object.keys(categoriaLabel) as Categoria[]).map((c) => ({ valor: c, nombre: categoriaLabel[c] })),
        potreros: potreros.map(etiqueta),
      },
    })
    if (error || !data || 'error' in data) return null
    const h = hojas[data.hoja]
    if (!h) return null
    const ancho = Math.max(0, ...h.filas.slice(0, 200).map((f) => f.length))
    const columnas: Partial<Record<Columna, number>> = {}
    for (const [c, i] of Object.entries(data.columnas ?? {}) as [Columna, number | null][]) if (Number.isInteger(i) && i! >= 0 && i! < ancho) columnas[c] = i!
    const porNombre = new Map(potreros.map((p) => [etiqueta(p), p.id]))
    return {
      hoja: data.hoja,
      filaTitulos: Math.min(Math.max(data.fila_titulos, -1), h.filas.length - 1),
      columnas,
      categorias: Object.fromEntries(data.categorias.filter((x) => x.categoria && x.categoria in categoriaLabel).map((x) => [x.texto, x.categoria as Categoria])),
      potreros: Object.fromEntries(data.potreros.filter((x) => x.potrero && porNombre.has(x.potrero)).map((x) => [x.texto, porNombre.get(x.potrero!)!])),
      fecha: data.fecha,
    }
  } catch {
    return null
  }
}
