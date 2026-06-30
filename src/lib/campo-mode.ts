import { useSyncExternalStore } from 'react'

// Override "forzar Modo Oficina desde un móvil". Por defecto un teléfono ve solo
// el Modo Campo (la oficina es ruido en el campo); este flag deja escaparse a
// Oficina cuando hace falta (ej. mirar Analítica desde el celular en un apuro).
// Persiste en localStorage y es un store externo para que el gate y los shells
// reaccionen al toggle sin prop-drilling.
const KEY = 'orka-force-oficina'
const listeners = new Set<() => void>()

export function getForceOficina(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function setForceOficina(value: boolean): void {
  if (value) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** `true` si el usuario forzó ver Oficina desde un móvil. */
export function useForceOficina(): boolean {
  return useSyncExternalStore(subscribe, getForceOficina, () => false)
}
