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
      <div className="relative isolate flex h-full flex-col bg-terracota-800">
        <FotoDeFondo />
        {/* El sello acompaña todo el recorrido y manda sobre el título (Lau 13/11): en el celular es el
            encabezado y el contenido se desliza debajo de él; en la compu, arriba a la izquierda. */}
        <header className="relative z-20 shrink-0 px-6 pt-[max(20px,calc(env(safe-area-inset-top)+12px))] pb-3 md:pointer-events-none md:absolute md:top-12 md:left-14 md:p-0">
          <Sello />
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            className="relative z-10 min-h-0 flex-1 [mask-image:linear-gradient(180deg,transparent,#000_20px)] md:h-full md:[mask-image:none]"
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
