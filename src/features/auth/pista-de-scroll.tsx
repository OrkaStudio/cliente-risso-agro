import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/**
 * "Bajá para continuar": aparece al pie del panel cuando hay contenido que no
 * entra y todavía no se bajó hasta el final. Un formulario largo con el
 * botón de continuar fuera de la vista se ve como una pantalla sin salida —
 * el usuario no scrollea porque nada le dice que hay algo abajo.
 *
 * Se engancha al contenedor `[data-auth-scroll]` hermano. Tocarlo baja
 * hasta el final. Se va solo al llegar, o cuando el botón marcado con
 * `data-cta-principal` ya está a la vista.
 */
export function PistaDeScroll() {
  const [visible, setVisible] = useState(false)
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null)
  const quieto = useReducedMotion()

  useEffect(() => {
    if (!contenedor) return
    const revisar = () => {
      // Mientras el remolque tiene el scroll bloqueado, la tarjeta está
      // desplazada un viewport entero y eso cuenta como contenido de más:
      // medir ahí decía "hay más abajo" cuando no había nada. Se espera.
      if (contenedor.style.overflowY === 'hidden') {
        setVisible(false)
        return
      }
      const sobra = contenedor.scrollHeight - contenedor.clientHeight
      // Si el botón principal ya se ve entero, lo
      // que queda abajo es secundario: la pista y el degradé lo tapaban y el
      // botón que importa quedaba lavado.
      const cta = contenedor.querySelector<HTMLElement>('[data-cta-principal]')
      const ctaALaVista =
        !!cta && cta.getBoundingClientRect().bottom <= contenedor.getBoundingClientRect().bottom - 8
      setVisible(!ctaALaVista && sobra > 24 && contenedor.scrollTop < sobra - 24)
    }
    revisar()
    contenedor.addEventListener('scroll', revisar, { passive: true })
    // El contenido cambia de alto sin que nadie scrollee (otro paso, un
    // error que aparece, la lista de localidades): se vuelve a medir.
    const ro = new ResizeObserver(revisar)
    ro.observe(contenedor)
    for (const hijo of Array.from(contenedor.children)) ro.observe(hijo)
    // Y cuando el remolque suelta el bloqueo (cambia el atributo style),
    // se mide recién ahí — con la tarjeta ya en su lugar.
    const mo = new MutationObserver(revisar)
    mo.observe(contenedor, { attributes: true, attributeFilter: ['style'] })
    return () => {
      contenedor.removeEventListener('scroll', revisar)
      ro.disconnect()
      mo.disconnect()
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
            key="degrade"
            aria-hidden
            // Opaco en la base y alto: la flecha queda sobre fondo limpio,
            // nunca sobre texto a medio leer (se veía superpuesto).
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t from-background from-35% via-background/85 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
        {visible && (
          <motion.button
            key="pista"
            type="button"
            onClick={() => contenedor?.scrollTo({ top: contenedor.scrollHeight, behavior: quieto ? 'auto' : 'smooth' })}
            // En el verde de la marca, grande y con la flecha que empuja: una
            // pastilla blanca sobre fondo claro no se veía.
            className="absolute bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary py-2.5 pr-4 pl-5 text-[15px] whitespace-nowrap font-semibold text-primary-foreground shadow-[0_10px_28px_-6px_rgba(23,138,85,0.6)] ring-4 ring-primary/15 transition-colors hover:bg-primary/90"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
          >
            Bajá para continuar
            <motion.span
              className="inline-flex"
              animate={quieto ? undefined : { y: [0, 4, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronDown className="size-[18px]" strokeWidth={2.75} />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
