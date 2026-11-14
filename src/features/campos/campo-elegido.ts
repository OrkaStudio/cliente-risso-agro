import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'

/**
 * Qué campo mira la Oficina: uno, o todos juntos. Se elige sólo desde la barra
 * izquierda y es el primer filtro de todas las pantallas (Lau, 29/10): Inicio,
 * Hacienda, Campos, Plata, Agenda y el clima de arriba. Con un solo campo no hay
 * nada que elegir. Se recuerda en este dispositivo.
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
/** El id elegido tal como está guardado (`'todos'`, un id o nada), para quien no necesita los campos. */
export function useCampoElegidoId(): string | null {
  const v = useSyncExternalStore(suscribir, leer, () => null)
  return v && v !== TODOS ? v : null
}

/** Elegir un campo (o null para todos) desde cualquier lado. */
export function elegirCampo(id: string | null) {
  guardar(id ?? TODOS)
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

/**
 * Avisa cuando se elige otro campo (en la barra o desde un link), no al cargar.
 * Para las pantallas de una sola cosa, como la ficha de un animal, que tienen
 * que irse si lo que muestran no está en el campo nuevo (Lau, 03/11).
 */
export function useAlElegirCampo(f: (id: string | null) => void) {
  const ultimo = useRef(f)
  useEffect(() => {
    ultimo.current = f
  })
  useEffect(() => {
    const dejar = suscribir(() => {
      const v = leer()
      ultimo.current(v && v !== TODOS ? v : null)
    })
    return () => {
      dejar()
    }
  }, [])
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
  const guardado = useSyncExternalStore(suscribir, leer, () => null)
  const campos = (data ?? []).map((c) => {
    const color = colorDeCampo(c.colorIdx ?? 0)
    return { id: c.id, nombre: c.nombre, letra: color.letra, color: color.hex }
  })
  const elegido = campos.length === 1 ? campos[0]! : guardado && guardado !== TODOS ? (campos.find((c) => c.id === guardado) ?? null) : null
  const elegir = elegirCampo
  return { campos, elegido, elegir }
}

/**
 * Un link que trae `?campo=` (el tutorial, el asistente, un aviso) elige ese
 * campo en la barra y se saca de la URL: la barra es la única que manda.
 */
export function useCampoDesdeUrl() {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('campo')
  useEffect(() => {
    if (!pedido) return
    elegirCampo(pedido)
    setParams(
      (p) => {
        p.delete('campo')
        return p
      },
      { replace: true },
    )
  }, [pedido, setParams])
  return pedido
}
