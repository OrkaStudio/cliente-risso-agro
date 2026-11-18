import { motion } from 'framer-motion'
import { categoriaNombre, coloresPorCategoria } from '@/features/hacienda/labels'
import { soloBovinos, type Compo } from './bovinos'
import { CLabel } from '../ui'

/**
 * Qué hay en un potrero, con la misma lectura que el panel de la Recorrida:
 * el total grande arriba y el desglose por categoría con su punto de color.
 * El productor ya sabe leer esta forma — no hay que enseñarle otra.
 *
 * Se usa en los DOS extremos del trabajo: el potrero del que salen los
 * animales y el potrero al que van. Saber qué hay del otro lado importa —
 * mandar terneros a un potrero con toros no es lo mismo que a uno vacío.
 */


export function ComposicionPotrero({
  items,
  vacioTexto = 'Está vacío',
  compacto = false,
}: {
  items: Compo[]
  /** Qué decir cuando no hay bovinos. Cambia según el lado del trabajo. */
  vacioTexto?: string
  /** Sin el total grande: cuando el número ya está arriba en el panel. */
  compacto?: boolean
}) {
  const bovinos = soloBovinos(items)
  const total = bovinos.reduce((s, i) => s + i.cabezas, 0)
  const colores = coloresPorCategoria(bovinos.map((i) => i.categoria))
  // Del más numeroso al menos: se lee primero lo que pesa.
  const orden = [...bovinos].sort((a, b) => b.cabezas - a.cabezas)

  if (orden.length === 0) {
    return (
      <p className="text-[13px] text-[var(--c-ink-soft)]">{vacioTexto}</p>
    )
  }

  return (
    <div>
      {!compacto && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className="c-mono text-[30px] font-bold leading-none text-[var(--c-ink)]">
            {total}
          </span>
          <CLabel>cabezas</CLabel>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 rounded-xl bg-[var(--c-sunk)] px-3 py-2.5">
        {orden.map((i, idx) => (
          <motion.li
            key={i.categoria}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.18 }}
            className="flex items-center gap-2.5 py-[3px]"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colores[i.categoria] }}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--c-ink)]">
              {categoriaNombre(i.categoria, i.cabezas)}
            </span>
            <span className="c-mono shrink-0 text-[14px] font-bold text-[var(--c-ink)]">
              {i.cabezas}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
