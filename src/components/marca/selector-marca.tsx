import { useVarianteMarca, aplicarVarianteMarca, VARIANTES_MARCA } from '@/lib/marca'
import { cn } from '@/lib/utils'

/**
 * Selector de variante de marca, sólo para esta vista previa: flota abajo al
 * centro (sobre la nav del Modo Campo en el teléfono). `?captura` lo oculta.
 */
export function SelectorMarca() {
  const actual = useVarianteMarca()
  if (new URLSearchParams(window.location.search).has('captura')) return null
  return (
    <div
      role="radiogroup"
      aria-label="Variante de marca"
      className="fixed bottom-[88px] left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-white/95 p-1 text-[12px] font-semibold shadow-[0_8px_30px_rgba(16,30,20,0.18)] backdrop-blur lg:bottom-5"
    >
      <span className="px-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">Marca</span>
      {VARIANTES_MARCA.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={actual === v.id}
          onClick={() => aplicarVarianteMarca(v.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors',
            actual === v.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-black/5',
          )}
        >
          <span className="size-2.5 rounded-full" style={{ background: v.color }} />
          {v.nombre}
        </button>
      ))}
    </div>
  )
}
