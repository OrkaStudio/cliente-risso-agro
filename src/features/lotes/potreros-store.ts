// Store reactivo de atributos editables del potrero (hectáreas, cultivo).
// Seed desde el mock, override y persistencia en localStorage. La hacienda no
// vive acá: vive en el lote que ocupa el potrero (ver store.ts). Fase 0; luego
// va a la tabla `potrero` de Supabase.
import { useSyncExternalStore } from 'react'
import { potreros as seed } from '@/features/lotes/mock'

import type { FeatureId } from '@/features/lotes/potrero-features'

export type PotreroAttrs = {
  hectareas?: number
  cultivo?: string
  features?: FeatureId[]
}

const LS = 'risso-potrero-attrs'
const key = (campoId: string, numero: string) => `${campoId}::${numero}`

function load(): Record<string, PotreroAttrs> {
  const base: Record<string, PotreroAttrs> = {}
  for (const p of seed) {
    base[key(p.campoId, p.numero)] = { hectareas: p.hectareas, cultivo: p.cultivo }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(LS) ?? '{}') as Record<
      string,
      PotreroAttrs
    >
    for (const k of Object.keys(saved)) base[k] = { ...base[k], ...saved[k] }
  } catch {
    /* sin override */
  }
  return base
}

let state = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(LS, JSON.stringify(state))
  } catch {
    /* sin persistencia */
  }
}
function emit() {
  state = { ...state }
  persist()
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function getSnapshot() {
  return state
}

export function usePotrerosAttrs() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function getPotreroAttrs(
  campoId: string,
  numero: string,
): PotreroAttrs {
  return state[key(campoId, numero)] ?? {}
}

export function setPotreroAttrs(
  campoId: string,
  numero: string,
  attrs: PotreroAttrs,
) {
  const k = key(campoId, numero)
  state[k] = { ...state[k], ...attrs }
  emit()
}
