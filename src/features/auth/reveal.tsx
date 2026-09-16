import { type ReactNode } from 'react'
import { motion } from 'framer-motion'

/**
 * Reveal escalonado para las pantallas de auth: el contenido sube mientras
 * un panel verde campo barre hacia la derecha y lo descubre. Adaptación del
 * patrón "BoxReveal" a framer-motion, con la paleta de la app.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  /** Segundos antes de arrancar (para escalonar campos del form). */
  delay?: number
  className?: string
}) {
  // `className` va en el motion.div, que es el padre real de los children:
  // un `grid gap-2` tiene que separar label e input, no envolver al bloque.
  return (
    // -m-1 p-1: 4px de holgura para que el anillo de foco (2px + 2px de
    // offset) del último input del bloque no quede recortado por el overflow.
    <div className="relative -m-1 overflow-hidden p-1">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: delay + 0.18, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
      <motion.span
        aria-hidden
        className="absolute inset-y-0.5 z-10 rounded-sm bg-primary"
        initial={{ left: 0, right: 0 }}
        animate={{ left: '100%', right: '-4%' }}
        transition={{ duration: 0.45, delay, ease: 'easeIn' }}
      />
    </div>
  )
}
