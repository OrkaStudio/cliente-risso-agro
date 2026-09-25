import { createContext } from 'react'

/**
 * Adentro de un paso que ya entra animado (los pasos del onboarding), los
 * bloques de `Reveal` NO vuelven a aparecer de a uno: el paso entra en un
 * solo movimiento, y si después cada campo hacía su propio fundido
 * escalonado, la pantalla parecía cargar dos veces.
 */
export const RevealMudo = createContext(false)
