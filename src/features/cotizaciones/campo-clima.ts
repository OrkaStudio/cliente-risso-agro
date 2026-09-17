import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { centroDelCampo } from '@/features/campos/api'
import type { UbicacionClima } from '@/features/cotizaciones/api'

/**
 * Qué campo muestra el clima. El productor con varios campos en distintas
 * localidades elige uno (ticker y panel del Inicio comparten la elección) y
 * la app lo recuerda en este dispositivo. Sin elección, el primero que tenga
 * ubicación. Sin ninguno con ubicación → null: la UI pide cargarla.
 */
const CLAVE = 'clima-campo-id'
const oyentes = new Set<() => void>()

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}
function elegir(id: string) {
  try {
    localStorage.setItem(CLAVE, id)
  } catch {
    /* sin storage: queda sólo en memoria de esta sesión */
  }
  oyentes.forEach((f) => f())
}
function suscribir(f: () => void) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

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
  const elegidoId = useSyncExternalStore(suscribir, leer, () => null)

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
    elegir: useCallback((id: string) => elegir(id), []),
    cargando: campos.isLoading,
  }
}
