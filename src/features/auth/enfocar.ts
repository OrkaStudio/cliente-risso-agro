/**
 * Foco a un campo sin el salto del navegador: primero lo deslizamos a la
 * vista (suave, centrado) y recién ahí enfocamos con `preventScroll`.
 */
export function enfocarSuave(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}
