import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { FotoDeFondo, Sello } from './acceso-layout'
import { DentroDelFondo } from './fondo-contexto'

/**
 * El marco de las pantallas de acceso (Lau, 13/11: al pasar del login al registro
 * o a «Te ayudamos» se sentía una recarga). La foto y el sello viven acá y no se
 * mueven al navegar; sólo cambia el contenido, con un fundido corto.
 */
export function FondoAcceso() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  return (
    <DentroDelFondo.Provider value>
      <div className="relative isolate h-full bg-terracota-800">
        <FotoDeFondo />
        {/* El sello, quieto en su lugar; el contenido pasa por encima al deslizar. */}
        <div className="pointer-events-none absolute top-[max(24px,calc(env(safe-area-inset-top)+16px))] left-6 md:top-12 md:left-14">
          <Sello />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            className="relative z-10 h-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.14, ease: 'easeOut' } }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </div>
    </DentroDelFondo.Provider>
  )
}
