import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

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
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <motion.div
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
