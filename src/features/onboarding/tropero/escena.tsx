import { useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { repartir } from '@/features/onboarding/croquis-layout'
import { cn } from '@/lib/utils'
import textura from '@/assets/tropero/textura-campo.webp'
import type { Especie } from '@/features/hacienda/labels'
import { MarcaCultivo } from './marcas'
import { cabezasDe, conMayuscula, diasDesde, especiesDe, ha, ICONO_ESPECIE, type PotreroOnb } from './modelo'

const NOMBRE_ESPECIE: Record<Especie, string> = { bovino: 'Vacunos', ovino: 'Ovinos', equino: 'Equinos' }

// La escena del onboarding (página 35): el campo se va dibujando a medida que
// se carga. Los potreros son un mosaico proporcional a sus hectáreas
// (`repartir`, el mismo reparto del croquis, probado con miles de casos).

const CURVA = [0.22, 1, 0.36, 1] as const

/** Mide el contenedor para ubicar los potreros en píxeles y dimensionar sus textos. */
function useMedida<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [medida, setMedida] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setMedida({ w: e.contentRect.width, h: e.contentRect.height }))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, medida] as const
}

export type Lamina =
  | { tipo: 'vacio' }
  | { tipo: 'campo'; nombre: string; detalle: string; clima?: string | null }
  | { tipo: 'potreros'; potreros: PotreroOnb[]; activo?: string }

/** El fondo con la textura del campo, en compu y en celular. */
export function Escena({
  lamina,
  totales,
  compacta = false,
}: {
  lamina: Lamina
  totales: { hectareas: number | null; potreros: number | null; cabezas: number | null }
  /** Celular: más chica, con los totales en una píldora. */
  compacta?: boolean
}) {
  return (
    <div
      className={cn(
        'relative isolate flex flex-col overflow-hidden bg-superficie-hundida',
        compacta ? 'h-[250px] rounded-[28px] p-3' : 'h-full rounded-[32px] p-[52px] pb-0',
      )}
    >
      <img src={textura} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-[0.18]" />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {lamina.tipo === 'vacio' && <LaminaVacia key="vacio" compacta={compacta} />}
          {lamina.tipo === 'campo' && <LaminaCampo key="campo" {...lamina} compacta={compacta} />}
          {lamina.tipo === 'potreros' && (
            <Mosaico key="potreros" potreros={lamina.potreros} activo={lamina.activo} compacta={compacta} />
          )}
        </AnimatePresence>
      </div>
      <Totales {...totales} compacta={compacta} />
    </div>
  )
}

function LaminaVacia({ compacta }: { compacta: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: CURVA }}
      className="grid size-full place-items-center rounded-2xl border-2 border-dashed border-texto-suave/50"
    >
      <p
        className={cn(
          'px-4 text-center font-heading font-extrabold text-texto-suave',
          compacta ? 'text-[15px]' : 'text-[24px]',
        )}
      >
        Acá se va a ir dibujando tu campo
      </p>
    </motion.div>
  )
}

function LaminaCampo({
  nombre,
  detalle,
  clima,
  compacta,
}: {
  nombre: string
  detalle: string
  clima?: string | null
  compacta: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: CURVA }}
      className={cn(
        'flex size-full flex-col rounded-2xl border-[3px] border-principal bg-superficie',
        compacta ? 'p-4' : 'p-7',
      )}
    >
      <p
        className={cn(
          'titulo-display break-words text-texto',
          compacta ? 'text-[30px]' : 'text-[56px]',
          !nombre && 'text-texto-suave/40',
        )}
      >
        {nombre || 'Tu campo'}
      </p>
      {detalle && (
        <p className={cn('mt-2 font-semibold text-texto-suave', compacta ? 'text-[13px]' : 'text-[15px]')}>
          {detalle}
        </p>
      )}
      {clima && (
        <span
          className={cn(
            'mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-acento px-3 py-1.5 font-semibold text-acento-texto',
            compacta ? 'text-[12px]' : 'text-[13.5px]',
          )}
        >
          <Icono nombre="Lluvia" tamano={16} />
          {clima}
        </span>
      )}
    </motion.div>
  )
}

function Mosaico({
  potreros,
  activo,
  compacta,
}: {
  potreros: PotreroOnb[]
  activo?: string
  compacta: boolean
}) {
  const [ref, { w, h }] = useMedida<HTMLDivElement>()
  const reducir = useReducedMotion()
  const gap = compacta ? 8 : 12
  const rects =
    w > 0
      ? repartir(
          potreros.map((p) => ({ clave: p.id, area: p.hectareas > 0 ? p.hectareas : 1 })),
          { x: 0, y: 0, w: w + gap, h: h + gap },
        )
      : {}
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="relative size-full"
    >
      {potreros.map((p, i) => {
        const r = rects[p.id]
        if (!r) return null
        return (
          <motion.div
            key={p.id}
            layout={!reducir}
            initial={reducir ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: CURVA, delay: reducir ? 0 : Math.min(i, 12) * 0.04 }}
            className="absolute"
            style={{ left: r.x, top: r.y, width: r.w - gap, height: r.h - gap }}
          >
            <Potrero potrero={p} activo={p.id === activo} compacta={compacta} />
          </motion.div>
        )
      })}
    </motion.div>
  )
}

function Potrero({ potrero, activo, compacta }: { potrero: PotreroOnb; activo: boolean; compacta: boolean }) {
  const [ref, { w, h }] = useMedida<HTMLDivElement>()
  const c = potrero.contenido
  const pad = compacta ? 10 : 18
  const chico = w < 64 || h < 44
  const cabezas = cabezasDe(c)
  const especies = especiesDe(c)
  // Lo que se dibuja (íconos, número, cultivo) se mide contra el lugar que hay:
  // aparece siempre, más chico en un potrero angosto.
  const libreW = Math.max(0, w - pad * 2)
  const libreH = Math.max(0, h - pad * 2)
  const icono = Math.max(14, Math.min(compacta ? 22 : 30, libreW * 0.32, (libreH - 6) / Math.max(1, especies.length) - 6))
  const grande = Math.max(16, Math.min(libreH * 0.34, libreW * 0.42, compacta ? 40 : 64))
  const hectareas = potrero.hectareas > 0 ? `${ha(potrero.hectareas)} ha` : '— ha'
  const dias = c?.tipo === 'descanso' && c.desde ? diasDesde(c.desde, new Date()) : null
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex size-full overflow-hidden rounded-2xl border-2 transition-colors duration-300',
        c?.tipo === 'hacienda'
          ? 'border-principal bg-principal text-principal-texto'
          : c?.tipo === 'sembrado'
            ? 'border-acento bg-acento text-acento-texto'
            : c?.tipo === 'descanso'
              ? 'border-estado-bien/30 bg-estado-bien-suave text-estado-bien-texto'
              : 'border-borde bg-superficie text-texto',
        activo && (c ? 'ring-[3px] ring-terracota-700 ring-inset' : 'border-[4px] border-principal'),
      )}
      style={{
        padding: pad,
        ...(c?.tipo === 'sembrado'
          ? {
              backgroundImage:
                'repeating-linear-gradient(-55deg, transparent 0 22px, color-mix(in srgb, var(--acento-texto) 14%, transparent) 22px 24px)',
            }
          : c?.tipo === 'descanso'
            ? {
                // Pasto que crece: matas suaves, sin texto encima.
                backgroundImage:
                  'radial-gradient(circle at 20% 80%, color-mix(in srgb, var(--estado-bien) 16%, transparent) 0 3px, transparent 4px), radial-gradient(circle at 70% 40%, color-mix(in srgb, var(--estado-bien) 12%, transparent) 0 2.5px, transparent 3.5px)',
                backgroundSize: '28px 28px, 22px 22px',
              }
            : {}),
      }}
    >
      {/* Izquierda: nombre, hectáreas y el dato grande. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className={cn('truncate font-heading font-extrabold leading-tight', chico ? 'text-[12px]' : compacta ? 'text-[15px]' : 'text-[22px]')}>
          {potrero.nombre}
        </p>
        {!chico && (
          <p className={cn('truncate font-semibold opacity-80', compacta ? 'text-[11.5px]' : 'text-[14px]')}>{hectareas}</p>
        )}
        {c?.tipo === 'hacienda' && cabezas > 0 && libreH > 60 && (
          <p className="titulo-display mt-auto leading-none" style={{ fontSize: grande }}>
            {cabezas}
          </p>
        )}
        {/* El cultivo siempre, a la medida del potrero: entra en el ancho y
            nunca grita más que el nombre. */}
        {c?.tipo === 'sembrado' && c.cultivo.trim() && libreH > 30 && (
          <p
            className="mt-auto truncate font-heading font-extrabold leading-tight"
            style={{ fontSize: Math.max(11, Math.min(compacta ? 15 : 24, libreW / (Math.max(3, c.cultivo.trim().length) * 0.62))) }}
          >
            {conMayuscula(c.cultivo.trim())}
          </p>
        )}
        {dias !== null && libreH > 60 && (
          <div className="mt-auto">
            <p className="titulo-display leading-none" style={{ fontSize: grande }}>
              {dias} {dias === 1 ? 'día' : 'días'}
            </p>
            <p className={cn('font-semibold opacity-80', compacta ? 'text-[11px]' : 'text-[13.5px]')}>descansando</p>
          </div>
        )}
      </div>
      {/* Derecha: una columna con lo que hay (cada especie, o el cultivo). */}
      {(especies.length > 0 || c?.tipo === 'sembrado' || c?.tipo === 'descanso') && (
        <div className="flex shrink-0 flex-col items-center gap-1.5 pl-1">
          {especies.map((e) => (
            <span key={e} className="grid place-items-center rounded-full bg-black/10" style={{ width: icono + 8, height: icono + 8 }}>
              <IconoEscalado nombre={ICONO_ESPECIE[e]} tamano={icono} titulo={NOMBRE_ESPECIE[e]} />
            </span>
          ))}
          {c?.tipo === 'sembrado' && <MarcaCultivo cultivo={c.cultivo} tamano={Math.max(18, icono * 1.2)} />}
          {c?.tipo === 'descanso' && <IconoEscalado nombre="Agua" tamano={icono} titulo="En descanso" />}
        </div>
      )}
    </div>
  )
}

/** Un ícono del set a cualquier tamaño (el set viene en 16 y 24). */
function IconoEscalado({ nombre, tamano, titulo }: { nombre: NombreIcono; tamano: number; titulo?: string }) {
  return (
    <span style={{ width: tamano, height: tamano }} className="grid place-items-center">
      <Icono nombre={nombre} titulo={titulo} className="size-full" />
    </span>
  )
}

function Totales({
  hectareas,
  potreros,
  cabezas,
  compacta,
}: {
  hectareas: number | null
  potreros: number | null
  cabezas: number | null
  compacta: boolean
}) {
  const items = [
    { valor: hectareas, nombre: 'hectáreas', corto: 'ha' },
    { valor: potreros, nombre: 'potreros', corto: 'potreros' },
    { valor: cabezas, nombre: 'cabezas', corto: 'cabezas' },
  ]
  if (compacta) {
    return (
      <div className="mt-2.5 flex w-fit items-baseline gap-4 rounded-2xl bg-superficie/90 px-3.5 py-2">
        {items.map((i) => (
          <span key={i.nombre} className="flex items-baseline gap-1">
            {i.valor === null ? (
              <span className="inline-block h-[3px] w-4 self-center rounded bg-texto-suave/70" />
            ) : (
              <span className="titulo-display text-[20px] text-texto">{ha(i.valor)}</span>
            )}
            <span className="text-[12.5px] font-semibold text-texto-suave">{i.corto}</span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex gap-11 py-9">
      {items.map((i) => (
        <div key={i.nombre} className="flex flex-col">
          {i.valor === null ? (
            <span className="my-[22px] inline-block h-1 w-9 rounded bg-texto-suave/70" />
          ) : (
            <span className="titulo-display text-[46px] leading-none tracking-[-0.02em] text-texto">{ha(i.valor)}</span>
          )}
          <span className="mt-1 text-[14.5px] font-semibold text-texto-suave">{i.nombre}</span>
        </div>
      ))}
    </div>
  )
}
