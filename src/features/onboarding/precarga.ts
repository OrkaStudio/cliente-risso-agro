import { createElement, type ComponentType, type ReactElement } from 'react'

/**
 * El onboarding, bajado de antemano. El registro lo pide mientras el
 * productor revisa sus datos; cuando confirma, la ruta ya lo tiene y lo
 * dibuja directo. Con `lazy` solo, aunque el código ya estuviera, el primer
 * render suspendía y quedaba la pantalla en blanco entre el registro y el
 * onboarding.
 */
let cargado: ComponentType | null = null
let pedido: Promise<void> | null = null

export function precargarOnboarding(): Promise<void> {
  pedido ??= import('@/features/onboarding/onboarding-page').then((m) => {
    cargado = m.OnboardingPage
  })
  return pedido
}

/** El componente, para `lazy` (que lo pide después de `precargarOnboarding`). */
export function componenteOnboarding(): ComponentType {
  return cargado!
}

/** El onboarding ya dibujable, o null si todavía no se bajó. */
export function onboardingListo(): ReactElement | null {
  return cargado ? createElement(cargado) : null
}
