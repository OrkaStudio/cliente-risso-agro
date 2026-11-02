import { useMemo } from 'react'
import { elegirCampo, useCampoElegidoId } from '@/features/campos/campo-elegido'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { centroDelCampo } from '@/features/campos/api'
import type { UbicacionClima } from '@/features/cotizaciones/api'

/**
 * Qué campo muestra el clima: el que está elegido en la barra izquierda
 * (campo-elegido). Con «Todos tus campos», o si el elegido no tiene ubicación,
 * el primero que la tenga. Sin ninguno con ubicación → null: la UI pide cargarla.
 */
export type OpcionClima = { id: string; nombre: string; ubicacion: UbicacionClima }

export function useCampoClima(): {
  /** Campos con centro conocido (los que pueden mostrar clima). */
  opciones: OpcionClima[]
  /** El elegido (o el primero con ubicación); null si ninguno tiene. */
  actual: OpcionClima | null
  elegir: (id: string) => void
  /** true mientras no sabemos todavía qué campos hay. */
  cargando: boolean
} {
  const campos = useCamposConPotreros()
  const elegidoId = useCampoElegidoId()

  const opciones = useMemo<OpcionClima[]>(
    () =>
      (campos.data ?? []).flatMap((c) => {
        const centro = centroDelCampo({ lat: c.ubicacion.lat, lon: c.ubicacion.lon })
        return centro ? [{ id: c.id, nombre: c.nombre, ubicacion: { nombre: c.nombre, ...centro } }] : []
      }),
    [campos.data],
  )
  const actual = opciones.find((o) => o.id === elegidoId) ?? opciones[0] ?? null

  return {
    opciones,
    actual,
    elegir: elegirCampo,
    cargando: campos.isLoading,
  }
}
