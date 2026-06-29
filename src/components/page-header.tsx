import type { ReactNode } from 'react'
import { motion, MotionConfig, type Variants } from 'framer-motion'
import { Sprout } from 'lucide-react'
import { cn } from '@/lib/utils'

const wrap: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.018, delayChildren: 0.04 } },
}
const letter: Variants = {
  hidden: { opacity: 0, y: '0.45em' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 24 },
  },
}

/** Título de página con identidad propia: revelado de letras + subrayado verde
 *  campo que se dibuja y termina en un brote (detalle agro). Re-anima al montar
 *  cada página; respeta prefers-reduced-motion. */
function AnimatedTitle({ text }: { text: string }) {
  const letters = Array.from(text)
  // El subrayado y el brote entran después de las letras.
  const tras = 0.04 + letters.length * 0.018

  return (
    <span className="relative inline-block">
      <motion.h1
        aria-label={text}
        variants={wrap}
        initial="hidden"
        animate="visible"
        className="inline-block font-heading text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-ink"
      >
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            variants={letter}
            className="inline-block"
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
      </motion.h1>

      {/* Subrayado degradé campo con glow (profundidad), se dibuja de izq. a der. */}
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: tras, duration: 0.5, ease: 'easeOut' }}
        className="absolute -bottom-2 left-0 h-[3px] w-full origin-left rounded-full bg-gradient-to-r from-field via-field-deep to-lima shadow-[0_1px_8px_rgba(23,138,85,0.45)]"
      />
      {/* Brote: detalle agro al final de la línea */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: tras + 0.42, type: 'spring', stiffness: 360, damping: 18 }}
        className="absolute -bottom-[13px] left-full ml-1 text-field-deep"
      >
        <Sprout className="size-[18px]" strokeWidth={2.2} />
      </motion.span>
    </span>
  )
}

/**
 * Encabezado de página (Agro-Analytical Modernism). Título con diseño propio
 * (ver AnimatedTitle), meta instrumental con números resaltados y acciones a la
 * derecha.
 */
export function PageHeader({
  title,
  meta,
  action,
  className,
}: {
  title: string
  /** Línea de contexto/estadísticas debajo del título. */
  meta?: ReactNode
  /** Acciones a la derecha (botones, filtros…). */
  action?: ReactNode
  className?: string
}) {
  return (
    <MotionConfig reducedMotion="user">
      <header
        className={cn(
          'flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
          className,
        )}
      >
        <div className="min-w-0">
          <AnimatedTitle text={title} />
          {meta && (
            <div className="mt-3.5 text-[14px] font-medium text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
        {action && (
          <div className="flex flex-wrap items-center gap-2.5">{action}</div>
        )}
      </header>
    </MotionConfig>
  )
}

/** Número resaltado dentro de la meta del header (tnum, ink). */
export function Stat({ children }: { children: ReactNode }) {
  return <b className="tnum font-bold text-ink">{children}</b>
}
