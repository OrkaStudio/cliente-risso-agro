import { useCallback, useSyncExternalStore } from 'react'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'

/**
 * Qué campo mira la Oficina (Inicio, Hacienda): uno, o todos juntos. Con un solo campo no hay nada
 * que elegir. Se recuerda en este dispositivo. Elegir un campo también lleva el
 * clima a ese campo (la barra de arriba y el panel dicen lo mismo).
 */
const CLAVE = 'inicio-campo-id' // el nombre viejo se conserva: no se pierde lo elegido
const TODOS = 'todos'
const oyentes = new Set<() => void>()

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}
function guardar(v: string) {
  try {
    localStorage.setItem(CLAVE, v)
  } catch {
    /* sin storage: queda sólo en esta sesión */
  }
  oyentes.forEach((f) => f())
}
function suscribir(f: () => void) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

export type CampoElegible = { id: string; nombre: string; letra: string; color: string }

export function useCampoElegido(): {
  campos: CampoElegible[]
  /** El campo elegido, o null para todos. */
  elegido: CampoElegible | null
  elegir: (id: string | null) => void
} {
  const { data: membresia } = useEmpresa()
  const { data } = useMapa(membresia?.empresa_id)
  const clima = useCampoClima()
  const guardado = useSyncExternalStore(suscribir, leer, () => null)
  const campos = (data ?? []).map((c) => {
    const color = colorDeCampo(c.colorIdx ?? 0)
    return { id: c.id, nombre: c.nombre, letra: color.letra, color: color.hex }
  })
  const elegido = campos.length === 1 ? campos[0]! : guardado && guardado !== TODOS ? (campos.find((c) => c.id === guardado) ?? null) : null
  const { elegir: elegirClima, opciones } = clima
  const elegir = useCallback(
    (id: string | null) => {
      guardar(id ?? TODOS)
      if (id && opciones.some((o) => o.id === id)) elegirClima(id)
    },
    [elegirClima, opciones],
  )
  return { campos, elegido, elegir }
}
