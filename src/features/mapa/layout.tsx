import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
import { abrirSoporte, haySoporte } from './soporte'

/** «Paso 2 de 3, marcar el borde» con sus tres tramos. */
export function PasoDe({ n, texto }: { n: 1 | 2 | 3; texto: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Paso ${n} de 3, ${texto}`}>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 w-7 rounded-full', i <= n ? 'bg-principal' : 'bg-borde')} />
        ))}
      </span>
      <span className="text-[13px] font-semibold text-texto-suave">
        Paso {n} de 3, {texto}
      </span>
    </div>
  )
}

/** La pastilla oscura sobre el mapa que dice qué hacer ahí. */
export function Pista({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-6 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full bg-tinta/90 px-4 py-2.5 text-[14px] font-semibold whitespace-nowrap text-superficie shadow-lg max-md:bottom-[calc(var(--alto-hoja)+14px)]"
    >
      <Icono nombre="Ayuda" tamano={16} className="text-acento" />
      {children}
    </div>
  )
}

/**
 * Marco del tutorial (página 35): el mapa a la izquierda (960 de 1440) con el
 * logo encima; el panel de 400 a la derecha. En el celular el mapa ocupa la
 * pantalla y el panel es una hoja abajo.
 */
export function LayoutMapa({
  mapa,
  sobreMapa,
  encima,
  titulo,
  children,
  salidas = true,
  onSalir,
  ayuda,
  nota,
}: {
  mapa: React.ReactNode
  /** Buscador y pistas, encima del mapa. */
  sobreMapa?: React.ReactNode
  /** Lo que va arriba del título: «Paso 2 de 3, …». */
  encima?: React.ReactNode
  titulo: string
  children: React.ReactNode
  salidas?: boolean
  onSalir: () => void
  /** Qué decir en el WhatsApp de «¿Dudas? Escribinos». */
  ayuda: string
  /** Por qué está acá: «La Agenda se abre cuando tu campo esté en el mapa». */
  nota?: string
}) {
  const reducir = useReducedMotion()
  return (
    <div className="relative flex h-full flex-col bg-fondo md:flex-row" style={{ ['--alto-hoja' as string]: '46vh' }}>
      <div className="relative min-h-0 flex-1 md:h-full">
        {mapa}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start gap-4 p-4 md:p-7">
          <span className="pointer-events-auto rounded-[14px] bg-superficie px-3.5 py-2 shadow-md">
            <Logo alto={22} />
          </span>
          {sobreMapa}
        </div>
      </div>
      <motion.aside
        key={titulo}
        initial={reducir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="z-[600] -mt-6 max-h-[var(--alto-hoja)] min-h-[var(--alto-hoja)] overflow-y-auto rounded-t-[28px] bg-fondo px-[18px] pt-6 pb-[max(18px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(19,27,22,0.12)] md:mt-0 md:flex md:h-full md:max-h-none md:w-[480px] md:shrink-0 md:flex-col md:rounded-none md:px-10 md:shadow-none"
      >
        <div className="flex flex-col gap-5 md:my-auto md:py-8">
          {nota && (
            <p className="flex w-fit items-center gap-2 rounded-full bg-estado-atencion-suave px-3.5 py-1.5 text-[13.5px] font-semibold text-estado-atencion-texto">
              <Icono nombre="Ayuda" tamano={16} />
              {nota}
            </p>
          )}
          {encima}
          <h1 className="titulo-display text-[28px] leading-[1.04] text-texto md:text-[38px]">{titulo}</h1>
          {children}
          {salidas && (
            <div className="flex flex-wrap gap-2 pt-1">
              {haySoporte && (
                <BotonChico type="button" className="py-1.5 text-[13.5px]" onClick={() => abrirSoporte(ayuda)}>
                  ¿Dudas? Escribinos
                </BotonChico>
              )}
              <BotonChico type="button" className="py-1.5 text-[13.5px]" onClick={onSalir}>
                Salir
              </BotonChico>
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  )
}
