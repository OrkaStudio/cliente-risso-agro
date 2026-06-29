// Factor de `zoom` aplicado a <html> (ver index.css). Los portales (menús,
// popovers) viven dentro de <body> → en el espacio zoomeado. Pero
// getBoundingClientRect() y window.innerW/H devuelven coordenadas VISUALES (ya
// multiplicadas por el zoom). Para posicionar un elemento `fixed` dentro del
// espacio zoomeado hay que DIVIDIR esas coordenadas por el zoom; si no, el menú
// queda corrido (más cuanto más lejos del origen). Sin zoom devuelve 1 → no-op.
export function rootZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1')
  return Number.isFinite(z) && z > 0 ? z : 1
}
