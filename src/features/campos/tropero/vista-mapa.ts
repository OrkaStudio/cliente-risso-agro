/**
 * Dónde quedó cada mapa, para que el viaje entre «Todos tus campos» y un
 * campo sea uno solo y continuo (Lau, 09/11): el mapa que aparece arranca
 * exactamente donde estaba el otro (con el satélite ya cargado) y viaja.
 */
export type Vista = { lat: number; lng: number; zoom: number }

let general: Vista | null = null
let deCampo: { id: string; vista: Vista } | null = null

export const recordarGeneral = (v: Vista) => (general = v)
export const vistaGeneral = () => general
export const recordarCampo = (id: string, v: Vista) => (deCampo = { id, vista: v })
export const vistaDeCampo = (id: string) => (deCampo?.id === id ? deCampo.vista : null)

/** El viaje de la cámara: largo y suave, sin frenadas (s). */
export const VIAJE = 1.35
