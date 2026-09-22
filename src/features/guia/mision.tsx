import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import {
  anclasEnPantalla,
  dialogoAbierto,
  medirAncla,
  recortar,
  ubicarJunto,
  useAltoReal,
  type Rect,
} from '@/features/guia/burbuja'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { type Resumen } from '@/features/guia/estado'
import { pararMision, useMarcarVista, useMisionActiva } from '@/features/guia/guia-store'
import { MISIONES, type Mision as MisionDef, type PasoMision } from '@/features/guia/misiones'
import { Orbe } from '@/features/guia/orbe'
import { cn } from '@/lib/utils'

/**
 * Motor de misiones: acompaña al productor mientras HACE (TASK-063).
 *
 * - Sin velo: la página queda usable entera. Lo único que se agrega es una
 *   burbuja chica pegada al botón que toca y un halo que respira sobre él.
 * - Cada ~0,5 s mira la realidad (diálogo abierto, anclas en pantalla, los
 *   números de la empresa refrescados cada 2,5 s) y avanza solo cuando el
 *   paso pasó. Nunca "Seguir".
 * - Si el productor se va a otra pantalla, la burbuja se corre al rincón y
 *   espera ("Seguimos en Campos · Llevame"); "Después" la guarda sin culpa —
 *   la misión vuelve a estar en la pastilla y en el panel.
 * - Al terminar, una alegría breve sobre el resultado real (el mapa, la
 *   lista), y listo.
 */

const ANCHO = 320
const ALTO_EST = 72
/** Spring lento: la burbuja se desliza, no salta. */
const VIAJE = { type: 'spring', stiffness: 120, damping: 22, mass: 0.9 } as const

type Fase = 'pasos' | 'festejo'

export function Mision() {
  const id = useMisionActiva()
  const estado = useEstadoPuestaAPunto()
  return (
    <AnimatePresence>
      {id && estado.data && (
        <MisionEnCurso key={id} mision={MISIONES[id]} inicial={estado.data.resumen} />
      )}
    </AnimatePresence>
  )
}

function MisionEnCurso({ mision, inicial }: { mision: MisionDef; inicial: Resumen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const estado = useEstadoPuestaAPunto()
  const marcarVista = useMarcarVista()
  const resumen = estado.data?.resumen ?? inicial

  // Los pasos se arman UNA vez con los números de arranque: los "antes"
  // (cuántos dibujados, cuántos sin potrero) son la vara del avance.
  const [pasos] = React.useState<PasoMision[]>(() => mision.pasos(inicial))
  const [idx, setIdx] = React.useState(0)
  const [fase, setFase] = React.useState<Fase>(pasos.length ? 'pasos' : 'festejo')
  const [rect, setRect] = React.useState<Rect | null>(null)
  const [enRuta, setEnRuta] = React.useState(true)

  const paso = fase === 'pasos' ? pasos[idx] : null
  const festejo = React.useMemo(() => mision.festejo(resumen), [mision, resumen])
  const destino = paso ? paso.ruta : festejo.ruta
  const ancla = paso ? paso.ancla : festejo.ancla

  // Al arrancar, llevarlo a donde vive el primer botón (aceptó la misión:
  // que no tenga que buscar). Sólo una vez.
  const llevado = React.useRef(false)
  React.useEffect(() => {
    if (llevado.current || !paso) return
    llevado.current = true
    // Con el campo incluido (?campo=…): en Campos con otro campo elegido
    // también hay que llevarlo.
    if (location.pathname + location.search !== paso.ruta) navigate(paso.ruta)
  }, [paso, location.pathname, location.search, navigate])

  // Mientras dura, los números se refrescan seguido: el contorno que acaba
  // de guardar tiene que verse en segundos.
  React.useEffect(() => {
    const iv = setInterval(
      () => qc.invalidateQueries({ queryKey: ['asistente-checklist'] }),
      2500,
    )
    return () => clearInterval(iv)
  }, [qc])

  // El tick: mide el ancla y pregunta si el paso ya pasó.
  const resumenRef = React.useRef(resumen)
  React.useEffect(() => {
    resumenRef.current = resumen
  }, [resumen])
  React.useEffect(() => {
    const tick = () => {
      const enLaRuta =
        location.pathname === new URL(destino, 'http://x').pathname
      setEnRuta(enLaRuta)
      const r = enLaRuta ? medirAncla(ancla) : null
      setRect(r ? recortar(r) : null)
      if (fase !== 'pasos') return
      const ctx = {
        resumen: resumenRef.current,
        pathname: location.pathname,
        dialogoAbierto: dialogoAbierto(),
        anclas: anclasEnPantalla(),
      }
      // El paso vigente es el primero que NO pasó todavía, calculado desde
      // cero cada vez: si cierra el diálogo sin buscar, vuelve al paso de
      // abrirlo — la burbuja dice la verdad, no un guion.
      let i = 0
      while (i < pasos.length && pasos[i]!.hecho(ctx)) i++
      if (i >= pasos.length) setFase('festejo')
      else if (i !== idx) setIdx(i)
    }
    const raf = requestAnimationFrame(tick)
    const iv = setInterval(tick, 500)
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    }
  }, [fase, idx, pasos, ancla, destino, location.pathname])

  // Festejo: se marca (para no festejar dos veces) y se va solo.
  React.useEffect(() => {
    if (fase !== 'festejo') return
    marcarVista(`mision.${mision.id}`)
    const t = setTimeout(() => pararMision(), 8000)
    return () => clearTimeout(t)
    // marcarVista es estable (mutate de React Query).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, mision.id])

  const [capRef, capH] = useAltoReal<HTMLDivElement>(ALTO_EST)
  const lejos = !enRuta
  const pos = ubicarJunto(lejos ? null : rect, ANCHO, capH)
  const z = paso?.sobreDialogo ? 'z-[60]' : 'z-[45]'
  const texto = fase === 'festejo' ? festejo.texto : lejos ? `Seguimos en ${nombreRuta(destino)}.` : paso!.texto

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* Halo que respira sobre el botón real. Sin velo alrededor. */}
      <AnimatePresence>
        {rect && !lejos && (
          <motion.div
            key={`halo:${ancla}:${fase}`}
            aria-hidden
            className={cn('pointer-events-none fixed rounded-xl', z)}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow:
                fase === 'festejo'
                  ? [
                      '0 0 0 2px rgba(163,230,53,0.0), 0 0 0 0px rgba(23,138,85,0.0)',
                      '0 0 0 3px rgba(163,230,53,0.9), 0 0 0 40px rgba(23,138,85,0.18)',
                      '0 0 0 2px rgba(163,230,53,0.0), 0 0 0 90px rgba(23,138,85,0.0)',
                    ]
                  : [
                      '0 0 0 2px rgba(163,230,53,0.55), 0 0 0 6px rgba(23,138,85,0.10)',
                      '0 0 0 3px rgba(163,230,53,0.95), 0 0 0 14px rgba(23,138,85,0.16)',
                      '0 0 0 2px rgba(163,230,53,0.55), 0 0 0 6px rgba(23,138,85,0.10)',
                    ],
            }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{
              left: VIAJE,
              top: VIAJE,
              width: VIAJE,
              height: VIAJE,
              opacity: { duration: 0.4 },
              boxShadow:
                fase === 'festejo'
                  ? { duration: 1.6, ease: 'easeOut' }
                  : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
        )}
      </AnimatePresence>

      {/* La burbuja: una línea, pegada al botón. Viaja con spring lento. */}
      <motion.div
        ref={capRef}
        role="status"
        data-mision={mision.id}
        className={cn(
          'fixed flex items-start gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-[0_14px_44px_rgba(10,20,14,0.22)]',
          z,
        )}
        style={{ width: Math.min(ANCHO, window.innerWidth - 24) }}
        initial={{ opacity: 0, left: pos.left, top: pos.top + 8, scale: 0.97 }}
        animate={{ opacity: 1, left: pos.left, top: pos.top, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={VIAJE}
      >
        <span className="relative mt-[1px]">
          <Orbe className="size-7 [&>svg]:size-3.5" />
          {/* Al festejar, seis chispas salen del orbe. Una vez, chicas. */}
          {fase === 'festejo' &&
            [0, 1, 2, 3, 4, 5].map((k) => (
              <motion.span
                key={k}
                aria-hidden
                className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-lima"
                initial={{ x: -3, y: -3, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos((k / 6) * Math.PI * 2) * 22 - 3,
                  y: Math.sin((k / 6) * Math.PI * 2) * 22 - 3,
                  opacity: 0,
                  scale: 0.4,
                }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
              />
            ))}
        </span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={texto}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="text-[14px] font-medium leading-snug text-ink"
            >
              {fase === 'festejo' && (
                <Check className="mr-1 inline size-4 text-field-deep" strokeWidth={3} />
              )}
              {texto}
            </motion.p>
          </AnimatePresence>
          <div className="mt-2 flex items-center justify-between">
            {/* Puntos de progreso: se ven, no se leen. */}
            <div className="flex items-center gap-1">
              {pasos.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    fase === 'festejo' || i < idx
                      ? 'w-4 bg-field'
                      : i === idx
                        ? 'w-4 bg-lima'
                        : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {lejos && fase === 'pasos' && (
                <button
                  type="button"
                  onClick={() => navigate(destino)}
                  className="rounded-full bg-field-deep px-3 py-1 text-[12px] font-bold text-white"
                >
                  Llevame
                </button>
              )}
              <button
                type="button"
                onClick={pararMision}
                className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-ink"
              >
                {fase === 'festejo' ? 'Listo' : 'Después'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </MotionConfig>,
    document.body,
  )
}

function nombreRuta(ruta: string): string {
  const p = new URL(ruta, 'http://x').pathname
  if (p === '/campos') return 'Campos'
  if (p === '/hacienda') return 'Hacienda'
  if (p === '/analitica') return 'Analítica'
  if (p === '/agenda') return 'Agenda'
  return 'Inicio'
}
