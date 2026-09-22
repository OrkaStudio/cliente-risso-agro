import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/**
 * "Seguí para abajo": aparece al pie del panel cuando hay contenido que no
 * entra y todavía no se bajó hasta el final. Un formulario largo con el
 * botón de continuar fuera de la vista se ve como una pantalla sin salida —
 * el usuario no scrollea porque nada le dice que hay algo abajo.
 *
 * Se engancha al contenedor `[data-auth-scroll]` hermano. Tocarlo baja
 * hasta el final. Se va solo al llegar.
 */
export function PistaDeScroll() {
  const [visible, setVisible] = useState(false)
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null)
  const quieto = useReducedMotion()

  useEffect(() => {
    if (!contenedor) return
    const revisar = () => {
      const sobra = contenedor.scrollHeight - contenedor.clientHeight
      setVisible(sobra > 24 && contenedor.scrollTop < sobra - 24)
    }
    revisar()
    contenedor.addEventListener('scroll', revisar, { passive: true })
    // El contenido cambia de alto sin que nadie scrollee (otro paso, un
    // error que aparece, la lista de localidades): se vuelve a medir.
    const ro = new ResizeObserver(revisar)
    ro.observe(contenedor)
    for (const hijo of Array.from(contenedor.children)) ro.observe(hijo)
    return () => {
      contenedor.removeEventListener('scroll', revisar)
      ro.disconnect()
    }
  }, [contenedor])

  return (
    <>
      <span
        hidden
        // Es hermano del contenedor con scroll, no descendiente: se busca
        // desde el padre.
        ref={(el) => setContenedor(el?.parentElement?.querySelector<HTMLElement>('[data-auth-scroll]') ?? null)}
      />
      <AnimatePresence>
        {visible && (
          // Un degradé al pie: lo que queda cortado se lee como cortado, y la
          // pista no parece pegada encima de un botón.
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-background to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
        {visible && (
          <motion.button
            type="button"
            onClick={() => contenedor?.scrollTo({ top: contenedor.scrollHeight, behavior: quieto ? 'auto' : 'smooth' })}
            className="absolute bottom-4 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 py-1.5 pr-3 pl-3.5 text-xs font-medium text-foreground shadow-[0_6px_20px_rgba(16,30,20,0.14)] backdrop-blur"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
          >
            Seguí para abajo
            <motion.span
              className="inline-flex"
              animate={quieto ? undefined : { y: [0, 3, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronDown className="size-3.5" strokeWidth={2.5} />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
