import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { cn } from '@/lib/utils'
import { ha, type Suma } from './modelo'

const CURVA = [0.22, 1, 0.36, 1] as const

/**
 * B3: las hectáreas del campo como una barra que se va llenando con cada
 * potrero. Siempre a la vista: cuánto hay cargado y cuánto falta. Cuando
 * cierran, la barra se completa y se festeja; si se pasan, se ve lo que sobra.
 */
export function MedidorHectareas({
  total,
  potreros,
  suma,
  onCampoMasGrande,
  ocupado,
}: {
  total: number
  /** Cada potrero con sus hectáreas (0 si todavía no las tiene). */
  potreros: { nombre: string; hectareas: number }[]
  suma: Suma
  onCampoMasGrande: (ha: number) => void
  ocupado: boolean
}) {
  const reducir = useReducedMotion()
  const cargadas = Math.round(potreros.reduce((s, p) => s + p.hectareas, 0) * 10) / 10
  const tope = Math.max(total, cargadas)
  const faltan = Math.max(0, Math.round((total - cargadas) * 10) / 10)
  const sobran = Math.max(0, Math.round((cargadas - total) * 10) / 10)
  const cierran = suma.estado === 'cierran'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[20px] border-[1.5px] px-5 py-4 transition-colors duration-300',
        cierran ? 'border-estado-bien bg-estado-bien-suave' : sobran > 0 ? 'border-estado-problema bg-superficie' : 'border-borde bg-superficie',
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <p className="leading-none text-texto">
          <span className={cn('titulo-display text-[34px] tracking-[-0.02em]', sobran > 0 && 'text-estado-problema-texto')}>{ha(cargadas)}</span>
          <span className="text-[16px] font-semibold text-texto-suave"> de {ha(total)} ha</span>
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={cierran ? 'ok' : sobran ? 'sobran' : 'faltan'}
            initial={reducir ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: CURVA }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-bold',
              cierran
                ? 'bg-estado-bien text-superficie'
                : sobran > 0
                  ? 'bg-estado-problema-suave text-estado-problema-texto'
                  : 'bg-estado-atencion-suave text-estado-atencion-texto',
            )}
          >
            {cierran ? (
              <>
                <Icono nombre="Guardar" tamano={16} /> Cierran justo
              </>
            ) : sobran > 0 ? (
              <>Sobran {ha(sobran)} ha</>
            ) : (
              <>Faltan {ha(faltan)} ha</>
            )}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* La barra: un tramo por potrero; lo que falta, punteado; lo que sobra,
          rayado en rojo, del otro lado del alambrado (el total del campo). */}
      <div className="relative">
        <div className="relative flex h-9 gap-[3px] overflow-hidden rounded-[10px] bg-superficie-hundida p-[3px]">
          {potreros.map((p, i) =>
            p.hectareas > 0 ? (
              <motion.div
                key={i}
                layout={!reducir}
                initial={false}
                animate={{ flexGrow: Math.min(p.hectareas, tope) }}
                transition={{ duration: 0.4, ease: CURVA }}
                className={cn(
                  'grid min-w-[3px] basis-0 place-items-center overflow-hidden rounded-[7px] text-[12px] font-bold whitespace-nowrap',
                  cierran ? 'bg-estado-bien text-superficie' : 'bg-principal text-principal-texto',
                )}
              >
                {(p.hectareas / tope) * 100 > 9 ? p.nombre : ''}
              </motion.div>
            ) : null,
          )}
          {faltan > 0 && (
            <motion.div
              layout={!reducir}
              animate={{ flexGrow: faltan }}
              transition={{ duration: 0.4, ease: CURVA }}
              className="basis-0 rounded-[7px] border-2 border-dashed border-texto-suave/35"
            />
          )}
          {sobran > 0 && (
            <motion.div
              aria-hidden
              initial={reducir ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pointer-events-none absolute inset-y-0 right-0 grid place-items-center rounded-r-[10px] text-[12px] font-extrabold text-superficie"
              style={{
                width: `${(sobran / tope) * 100}%`,
                backgroundImage:
                  'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--estado-problema) 88%, transparent) 0 7px, color-mix(in srgb, var(--estado-problema) 62%, transparent) 7px 14px)',
              }}
            >
              {(sobran / tope) * 100 > 12 && `+${ha(sobran)}`}
            </motion.div>
          )}
          {cierran && !reducir && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              initial={{ left: '-35%' }}
              animate={{ left: '110%' }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
          )}
        </div>
        {/* El alambrado: hasta dónde llega el campo. */}
        {sobran > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1.5 -bottom-6 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${(total / tope) * 100}%` }}
          >
            <span className="w-[3px] flex-1 rounded-full bg-texto" />
            <span className="mt-1 rounded-full bg-texto px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap text-superficie">
              {ha(total)} ha del campo
            </span>
          </div>
        )}
      </div>

      {sobran > 0 && (
        <div className="mt-5 flex flex-col gap-3 rounded-[14px] bg-estado-problema-suave px-4 py-3">
          <p className="text-[14px] leading-snug text-estado-problema-texto">
            <b>Los potreros se pasan del campo.</b> Corregí las hectáreas de alguno, o:
          </p>
          <BotonChico type="button" className="self-start bg-superficie" disabled={ocupado} onClick={() => onCampoMasGrande(cargadas)}>
            El campo tiene {ha(cargadas)} ha
          </BotonChico>
        </div>
      )}
      {faltan > 0 && suma.estado === 'faltan' && (
        <p className="text-[13.5px] text-texto-suave">Podés guardar igual: las que falten las dibujás en el mapa.</p>
      )}
    </div>
  )
}
