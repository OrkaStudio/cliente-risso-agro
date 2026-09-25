import { useSyncExternalStore } from 'react'

/**
 * Marca del producto (la web), separada del nombre de cada empresa/tenant.
 * "Risso Agro" era la empresa del padre de Lau; el producto se llama Tropero
 * (el que conoce el camino). Si cambia, se cambia acá y en index.html.
 */
export const MARCA = 'Tropero'
export const MARCA_TAGLINE = 'Gestión de campo'

/**
 * Dos variantes de marca en prueba, se eligen en vivo:
 * - `terracota`: terracota al frente (superficie terracota profunda, T hueso).
 * - `monte`: monte y trigo al frente, terracota como tercer color.
 * Se aplica como `data-marca` en <html>; los colores viven en index.css.
 * Orden de precedencia: `?marca=` en la URL → la última elegida → terracota.
 */
export type VarianteMarca = 'terracota' | 'monte'

export const VARIANTES_MARCA: { id: VarianteMarca; nombre: string; color: string }[] = [
  { id: 'terracota', nombre: 'Terracota', color: '#b85c2e' },
  { id: 'monte', nombre: 'Monte y trigo', color: '#0b5837' },
]

const CLAVE = 'tropero.marca'
const PREDETERMINADA: VarianteMarca = 'terracota'
/** Color de la barra del navegador / status bar (la superficie de marca). */
const THEME_COLOR: Record<VarianteMarca, string> = { terracota: '#7a3a1c', monte: '#0b5837' }

const esVariante = (v: unknown): v is VarianteMarca => v === 'terracota' || v === 'monte'

export function leerVarianteMarca(): VarianteMarca {
  try {
    const url = new URLSearchParams(window.location.search).get('marca')
    if (esVariante(url)) return url
    const guardada = localStorage.getItem(CLAVE)
    if (esVariante(guardada)) return guardada
  } catch {
    /* storage bloqueado: la predeterminada */
  }
  return PREDETERMINADA
}

let actual: VarianteMarca = PREDETERMINADA
const oyentes = new Set<() => void>()

export function aplicarVarianteMarca(v: VarianteMarca) {
  actual = v
  document.documentElement.dataset.marca = v
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[v])
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `/marca/${v}/favicon.svg`)
  document
    .querySelector('link[rel="apple-touch-icon"]')
    ?.setAttribute('href', `/marca/${v}/apple-touch-icon.png`)
  try {
    localStorage.setItem(CLAVE, v)
  } catch {
    /* sin persistencia */
  }
  oyentes.forEach((f) => f())
}

export function useVarianteMarca(): VarianteMarca {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => actual,
  )
}
