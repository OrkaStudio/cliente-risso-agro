// Que todo botón se hunda al apretarlo y rebote al soltarlo (B · Con cuerpo, Lau 18/11).
//
// Los componentes Boton/BotonPrincipal/BotonChico ya lo hacen con framer (whileTap). Esto
// cubre los ~320 <button> escritos a mano en las pantallas, sin tocarlos uno por uno: un solo
// escuchador en el documento que anima la propiedad `scale` (aparte de `transform`, así no
// pisa traslados ni rotaciones que el botón ya tenga) con el mismo resorte de lib/animacion.
//
// No se mete con: los que ya se mueven solos (motion: llevan data-movimiento o un `style`
// con transform), los que traen su propio `active:scale-*`, los apagados, y nada si el
// teléfono tiene «reducir movimiento».
import { HUNDIR } from './animacion'

/** El resorte de HUNDIR (rebote 0,55) pasado a una curva CSS `linear()`. */
function curvaDeResorte(rebote: number, puntos = 40): string {
  // Oscilador amortiguado que va de 0 a 1 con el rebote pedido.
  const zeta = Math.max(0.05, 1 - rebote)
  const w = 2 * Math.PI * 1.4
  const wd = w * Math.sqrt(1 - zeta * zeta)
  const vals: string[] = []
  for (let i = 0; i <= puntos; i++) {
    const t = i / puntos
    const x = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t))
    vals.push((i === puntos ? 1 : x).toFixed(3))
  }
  return `linear(${vals.join(', ')})`
}

const SOLTAR = curvaDeResorte(HUNDIR.resorte.bounce)
const BAJAR_MS = 90
const SUBIR_MS = 420

function sirve(b: HTMLButtonElement): boolean {
  if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false
  if (b.dataset.movimiento !== undefined) return false
  if (b.style.transform) return false
  if (/\bactive:scale-/.test(b.className)) return false
  return true
}

export function instalarHundir(): () => void {
  if (typeof window === 'undefined' || !('animate' in HTMLElement.prototype)) return () => {}
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)')
  let apretado: HTMLButtonElement | null = null
  // Sólo las animaciones de este archivo: las de framer o las transiciones del botón no se tocan.
  const mias = new WeakMap<HTMLButtonElement, Animation[]>()
  const anotar = (b: HTMLButtonElement, a: Animation) => mias.set(b, [...(mias.get(b) ?? []), a])

  const bajar = (e: PointerEvent) => {
    if (reducir.matches || e.button !== 0) return
    const b = (e.target as Element | null)?.closest?.('button')
    if (!(b instanceof HTMLButtonElement) || !sirve(b)) return
    apretado = b
    const chico = b.offsetWidth < 120 || b.offsetHeight < 40
    const escala = chico ? 0.93 : HUNDIR.escala
    anotar(b, b.animate([{ scale: getComputedStyle(b).scale === 'none' ? '1' : getComputedStyle(b).scale }, { scale: String(escala) }], { duration: BAJAR_MS, easing: 'ease-out', fill: 'forwards' }))
  }
  const soltar = () => {
    const b = apretado
    apretado = null
    if (!b) return
    const subir = b.animate([{ scale: getComputedStyle(b).scale }, { scale: '1' }], { duration: SUBIR_MS, easing: SOLTAR, fill: 'forwards' })
    anotar(b, subir)
    subir.finished.then(
      // Al terminar, dejar el botón como estaba: se cancelan sólo las animaciones de acá.
      () => {
        if (mias.get(b)?.at(-1) !== subir) return
        mias.get(b)?.forEach((a) => a.cancel())
        mias.delete(b)
      },
      () => {},
    )
  }

  document.addEventListener('pointerdown', bajar, { passive: true })
  document.addEventListener('pointerup', soltar, { passive: true })
  document.addEventListener('pointercancel', soltar, { passive: true })
  return () => {
    document.removeEventListener('pointerdown', bajar)
    document.removeEventListener('pointerup', soltar)
    document.removeEventListener('pointercancel', soltar)
  }
}
