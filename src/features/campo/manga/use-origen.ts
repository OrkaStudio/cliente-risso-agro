import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { recdb } from '@/features/campo/recorrida/db'
import type { RecPotrero } from '@/features/campo/recorrida/db'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'

/**
 * De dónde salen los animales que entran a la manga, elegido SOBRE EL CROQUIS.
 *
 * Lee el mismo cache que la Recorrida (`recdb.refs`): campos, potreros con su
 * polígono real y las tropas de cada uno. No baja nada propio ni duplica el
 * esquema — ese cache ya lo siembra el seeder central del Modo Campo al entrar
 * con señal, así que la manga hereda gratis el andar sin señal.
 *
 * Por qué el croquis y no una lista: los nombres de tropa se repiten entre
 * campos ("Lote 1" existe en tres) y nadie recuerda en qué potrero quedó cada
 * una. Lo que el productor sí sabe es la forma de su campo y el número de la
 * tranquera. Con el potrero elegido en el dibujo, el nombre de la tropa deja de
 * ser ambiguo — y si el potrero tiene una sola, no hay nada que preguntar.
 */

export type CampoManga = { id: string; nombre: string; colorHex: string }

export function useOrigen() {
  const refs = useLiveQuery(() => recdb.refs.get('refs'), [])
  const [campoId, setCampoId] = useState<string | null>(null)
  const [potreroId, setPotreroId] = useState<string | null>(null)

  // El color es IDENTIDAD del campo (`color_idx`, estable desde la migración
  // del 24/07): el mismo croquis se ve igual acá que en la Recorrida.
  const campos: CampoManga[] = (refs?.campos ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    colorHex: colorDeCampo(c.color_idx ?? 0).hex,
  }))

  // Campo activo: el elegido, o el primero que TENGA hacienda — arrancar en uno
  // vacío obliga a un toque para descubrir que ahí no hay nada que trabajar.
  const conHacienda = new Set(
    (refs?.potreros ?? []).filter((p) => p.cabezas > 0).map((p) => p.campo_id),
  )
  const campoActivo =
    campoId ??
    campos.find((c) => conHacienda.has(c.id))?.id ??
    campos[0]?.id ??
    null

  const potreros: RecPotrero[] = (refs?.potreros ?? [])
    .filter((p) => p.campo_id === campoActivo)
    .map((p) => ({
      id: p.id,
      campo_id: p.campo_id,
      nombre: p.nombre,
      estado_ciclo: p.estado_ciclo,
      cabezas: p.cabezas,
      composicion: p.composicion ?? [],
      // Sin caer a []: `undefined` = cache viejo que no sabe de tropas; `[]` =
      // sabemos que no hay y los animales están sueltos. Aplastar uno en otro
      // hace que la manga ofrezca trabajar sobre una tropa que no conoce.
      tropas: p.tropas,
      poligono: p.poligono,
      ultima: p.ultima,
      eliminado: 0 as const,
      // En la manga nada está "hecho": el croquis no pinta recorrido acá.
      hecho: 0 as const,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))

  const campo = campos.find((c) => c.id === campoActivo) ?? null
  const potrero = potreros.find((p) => p.id === potreroId) ?? null

  return {
    /** null = el cache todavía no cargó (distinto de "no hay campos"). */
    cargando: refs === undefined,
    sinCache: refs !== undefined && (refs?.campos.length ?? 0) === 0,
    campos,
    campo,
    campoActivo,
    elegirCampo: (id: string) => {
      setCampoId(id)
      setPotreroId(null) // el potrero de otro campo no significa nada acá
    },
    potreros,
    potrero,
    potreroId,
    setPotreroId,
  }
}
