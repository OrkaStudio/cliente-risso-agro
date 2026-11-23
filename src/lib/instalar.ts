// «Tené Troppero en tu celular» (Lau, 19/11): agregar la web a la pantalla de inicio,
// como una app. Chrome en Android avisa una sola vez, al cargar, que la web se puede
// instalar (`beforeinstallprompt`): se guarda ese aviso acá, apenas arranca la app, para
// usarlo cuando el productor toca el botón en Configuración. Safari en el iPhone no
// tiene ese aviso: ahí sólo se puede explicar el camino (Compartir → Agregar a inicio).
import { useSyncExternalStore } from 'react'

type AvisoInstalar = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let aviso: AvisoInstalar | null = null
let recienInstalada = false
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

/** Se llama una vez, antes de pintar: el aviso de Chrome llega enseguida y no se repite. */
export function escucharInstalacion() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin la barrita de Chrome: el lugar para instalar es el botón de Configuración.
    e.preventDefault()
    aviso = e as AvisoInstalar
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    aviso = null
    recienInstalada = true
    avisar()
  })
}

/**
 * Cómo se agrega en este teléfono:
 * - `boton`: Chrome dejó instalarla de un toque.
 * - `menu-android`: Android sin el aviso (otro navegador, o ya se rechazó): por el menú ⋮.
 * - `iphone`: Safari, Compartir → Agregar a inicio.
 * - `otra-app`: abierta adentro de WhatsApp, Instagram o Facebook: primero, al navegador.
 * - `instalada`: ya se abre desde el ícono (o se acaba de instalar).
 * - `compu`: no es un teléfono.
 */
export type ComoInstalar = 'boton' | 'menu-android' | 'iphone' | 'otra-app' | 'instalada' | 'compu'

export function comoInstalar(): ComoInstalar {
  if (typeof window === 'undefined') return 'compu'
  const nav = navigator as Navigator & { standalone?: boolean }
  if (recienInstalada || window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true) return 'instalada'
  const ua = nav.userAgent
  const iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
  const android = /Android/.test(ua)
  // El navegador de adentro de cada app se delata en el userAgent; en Android, cualquier «; wv)» es uno.
  if (/WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\//.test(ua) || (android && /; wv\)/.test(ua))) return 'otra-app'
  if (aviso) return 'boton'
  if (iphone) return 'iphone'
  if (android) return 'menu-android'
  return 'compu'
}

function suscribir(f: () => void) {
  oyentes.add(f)
  const mq = window.matchMedia?.('(display-mode: standalone)')
  mq?.addEventListener?.('change', f)
  return () => {
    oyentes.delete(f)
    mq?.removeEventListener?.('change', f)
  }
}

/** Abre el aviso de Chrome. Devuelve si la instaló. */
export async function instalar(): Promise<boolean> {
  const a = aviso
  if (!a) return false
  // El aviso sirve una sola vez: después de mostrarlo, Chrome no deja volver a usarlo.
  aviso = null
  await a.prompt()
  const { outcome } = await a.userChoice
  if (outcome === 'accepted') recienInstalada = true
  avisar()
  return outcome === 'accepted'
}

export function useComoInstalar(): ComoInstalar {
  return useSyncExternalStore(suscribir, comoInstalar, () => 'compu')
}
