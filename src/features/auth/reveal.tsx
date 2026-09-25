import { useContext, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CURVA } from '@/lib/animacion'
import { RevealMudo } from '@/features/auth/reveal-mudo'

/**
 * Reveal escalonado para las pantallas de auth y del onboarding: cada bloque
 * sube unos pocos píxeles y aparece, detrás del tractor que cruza la pantalla
 * (ver `Sembradora`). Acá adentro el movimiento es MUDO a propósito: la
 * personalidad va una vez por pantalla, no una vez por campo.
 *
 * Las dos versiones anteriores fallaron por la misma razón de fondo —un
 * efecto que necesita tapar algo—, y conviene no volver a intentarlo:
 *
 * 1. Un panel verde macizo barría hacia la derecha y descubría el texto.
 *    Gritaba la marca en cada uno de los ocho campos del formulario, y
 *    obligaba a `overflow: hidden` mientras barría para que el verde no
 *    asomara — lo que recortaba la lista de localidades.
 * 2. Un desenfoque de entrada. Más limpio, pero framer deja el `filter`
 *    escrito en el style inline al terminar, y `blur(0px)` NO es `none`:
 *    crea contexto de apilado igual. Eso encerró el `z-30` de la lista de
 *    localidades y los campos de abajo le pasaron por encima. Limpiarlo con
 *    la prop `style` no sirve: framer escribe después de React y gana.
 *
 * Por eso acá no hay filtro ni recorte de ningún tipo. Sólo `opacity` e `y`,
 * que framer resuelve a `transform: none` al terminar — sin contexto de
 * apilado, sin nada que limpiar después.
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
  const quieto = useReducedMotion()
  const mudo = useContext(RevealMudo)
  if (mudo) return <div className={className}>{children}</div>
  return (
    // `className` va en el motion.div, que es el padre real de los children:
    // un `grid gap-2` tiene que separar label e input, no envolver al bloque.
    <motion.div
      className={className}
      initial={quieto ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={quieto ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: quieto ? 0.2 : 0.5, delay, ease: CURVA }}
    >
      {children}
    </motion.div>
  )
}
