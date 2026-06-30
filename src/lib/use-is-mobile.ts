import { useSyncExternalStore } from 'react'

// Detección de dispositivo por viewport (no por Capacitor: el shell iOS no está
// montado todavía y el Modo Campo se abre desde el navegador del teléfono).
// 768px = breakpoint `md` de Tailwind: por debajo tratamos al equipo como móvil.
const QUERY = '(max-width: 767px)'

function subscribe(cb: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/** `true` cuando el viewport es de teléfono. Reactivo a resize/rotación. */
export function useIsMobile(): boolean {
  // getServerSnapshot → false: en SSR/prerender asumimos desktop (no hay window).
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
