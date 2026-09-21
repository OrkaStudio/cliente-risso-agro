import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CURVA } from '@/lib/animacion'

/**
 * Reveal escalonado para las pantallas de auth y del onboarding: el contenido
 * ENTRA EN FOCO. Sube unos pocos píxeles mientras se le va el desenfoque.
 *
 * Antes esto era un panel verde macizo que barría hacia la derecha y
 * descubría el texto, como un telón. Se cambió por tres razones:
 *
 * 1. El borde duro del panel y el verde a pantalla completa gritan la marca
 *    en cada campo del formulario. Repetido ocho veces seguidas en un form,
 *    cansa.
 * 2. El telón obligaba a `overflow: hidden` mientras barría, para que el
 *    verde no asomara. Eso recortaba cualquier desplegable que se abriera
 *    dentro del bloque —la lista de localidades— y obligó a un `-m-1 p-1`
 *    para que el anillo de foco tampoco quedara cortado. Sin panel, no hace
 *    falta recortar nada: los dos parches se fueron.
 * 3. Un elemento que se enfoca se lee como algo que TERMINA DE PENSARSE, y
 *    esa es la gramática que queremos.
 *
 * El desenfoque se saca del todo al terminar y no se deja en `blur(0px)`: un
 * `filter` activo, aunque sea nulo, crea bloque contenedor y stacking context
 * y le cambia el ancla a cualquier posicionado de adentro.
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
  const [entrando, setEntrando] = useState(true)
  const quieto = useReducedMotion()

  if (quieto) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      // Sin filtro una vez que llegó — ver la nota de arriba.
      style={entrando ? undefined : { filter: 'none' }}
      transition={{ duration: 0.55, delay, ease: CURVA }}
      onAnimationComplete={() => setEntrando(false)}
    >
      {children}
    </motion.div>
  )
}
