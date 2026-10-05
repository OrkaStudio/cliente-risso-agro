import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { repartir } from '@/features/onboarding/croquis-layout'
import { cn } from '@/lib/utils'
import textura from '@/assets/tropero/textura-campo.webp'
import { cabezasDe, ha, totales, type CampoOnb, type PotreroOnb } from './modelo'

// B6 · Cierre (página 35, «Onboarding · Cierre»). Sobrio: el campo cargado es
// el protagonista y el movimiento está en los detalles (spec, «Movimiento»):
// 0,1 s los potreros se arman de a uno · 0,5 s se dibuja la tilde · 0,6 s los
// totales cuentan · 1,0 s se llena el primer tramo · 1,4 s entra «Lo que sigue».

const CURVA = [0.22, 1, 0.36, 1] as const
/** En el dibujo de cada campo: los potreros más grandes; el resto, «y N más». */
const POTREROS_A_LA_VISTA = 4

function Cuenta({ hasta, demora }: { hasta: number; demora: number }) {
  const reducir = useReducedMotion()
  const [valor, setValor] = useState(0)
  useEffect(() => {
    if (reducir) return
    const c = animate(0, hasta, {
      duration: 0.8,
      delay: demora,
      ease: CURVA,
      onUpdate: (v) => setValor(Math.round(v)),
    })
    return () => c.stop()
  }, [hasta, demora, reducir])
  return <>{ha(reducir ? hasta : valor)}</>
}

function Tilde({ demora }: { demora: number }) {
  const reducir = useReducedMotion()
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-estado-bien text-superficie">
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path
          d="M20 6L9 17L4 12"
          initial={reducir ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: demora, ease: CURVA }}
        />
      </svg>
    </span>
  )
}

function useMedida<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [m, setM] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new ResizeObserver(([e]) => setM({ w: e.contentRect.width, h: e.contentRect.height }))
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return [ref, m] as const
}

/** El dibujo chico de un campo: sus potreros más grandes, de a uno. */
function MiniCampo({
  potreros,
  demora,
  className,
  chico = false,
}: {
  potreros: PotreroOnb[]
  demora: number
  className?: string
  /** Miniatura (la fila del celular): sólo los colores, sin textos. */
  chico?: boolean
}) {
  const [ref, { w, h }] = useMedida<HTMLDivElement>()
  const reducir = useReducedMotion()
  const gap = chico ? 3 : 6
  const vista = [...potreros].sort((a, b) => b.hectareas - a.hectareas).slice(0, POTREROS_A_LA_VISTA)
  const rects = w > 0 ? repartir(vista.map((p) => ({ clave: p.id, area: Math.max(p.hectareas, 1) })), { x: 0, y: 0, w: w + gap, h: h + gap }) : {}
  return (
    <div ref={ref} className={cn('relative', className)} aria-hidden>
      {vista.map((p, i) => {
        const r = rects[p.id]
        if (!r) return null
        const c = p.contenido
        const grande = Math.min((r.h - gap) * 0.3, (r.w - gap) * 0.3, 32)
        return (
          <motion.div
            key={p.id}
            initial={reducir ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: reducir ? 0 : demora + i * 0.04, ease: CURVA }}
            className={cn(
              'absolute flex flex-col overflow-hidden',
              chico ? 'rounded-[4px]' : 'rounded-lg p-2.5',
              c?.tipo === 'hacienda'
                ? 'bg-destacado text-destacado-texto'
                : c?.tipo === 'sembrado'
                  ? 'bg-acento text-acento-texto'
                  : c?.tipo === 'descanso'
                    ? 'bg-estado-bien-suave text-texto'
                    : 'bg-superficie text-texto',
            )}
            style={{
              left: r.x,
              top: r.y,
              width: r.w - gap,
              height: r.h - gap,
              ...(c?.tipo === 'sembrado'
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(-60deg, transparent 0 10px, color-mix(in srgb, var(--acento-texto) 14%, transparent) 10px 11.5px)',
                  }
                : {}),
            }}
          >
            {!chico && <div className="flex items-start justify-between">
              <span className="font-heading text-[12px] font-extrabold">{p.nombre}</span>
              {c?.tipo === 'hacienda' && <Icono nombre="Vaca" tamano={16} className="size-3" />}
            </div>}
            {!chico && grande >= 16 && c?.tipo === 'hacienda' && cabezasDe(c) > 0 && (
              <span className="titulo-display mt-auto leading-none" style={{ fontSize: grande }}>
                {cabezasDe(c)}
              </span>
            )}
            {!chico && grande >= 16 && c?.tipo === 'sembrado' && (
              <span className="titulo-display mt-auto truncate leading-none" style={{ fontSize: grande * 0.9 }}>
                {c.cultivo}
              </span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function resumenDe(c: CampoOnb): string {
  const cab = c.potreros.reduce((s, p) => s + cabezasDe(p.contenido), 0)
  return [
    c.tipo === 'propio' ? 'Propio' : 'Alquilado',
    `${ha(c.hectareas)} ha`,
    `${c.potreros.length} ${c.potreros.length === 1 ? 'potrero' : 'potreros'}`,
    `${cab} cabezas`,
  ].join(' · ')
}

function Arranque() {
  const reducir = useReducedMotion()
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13.5px] font-semibold text-texto-suave md:text-[14px]">El arranque · paso 1 de 3 completo</p>
      <div className="flex gap-1.5" aria-hidden>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-superficie-hundida">
          <motion.span
            className="block h-full origin-left rounded-[3px] bg-principal"
            initial={reducir ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 1.0, ease: CURVA }}
          />
        </span>
        <span className="h-1.5 flex-1 rounded-[3px] bg-superficie-hundida" />
        <span className="h-1.5 flex-1 rounded-[3px] bg-superficie-hundida" />
      </div>
    </div>
  )
}

const ABRE: { icono: NombreIcono; texto: string }[] = [
  { icono: 'Recorrida', texto: 'La recorrida' },
  { icono: 'Manga', texto: 'La manga' },
  { icono: 'Hacienda', texto: 'Hacienda por potrero' },
]

function LoQueSigue() {
  const reducir = useReducedMotion()
  return (
    <motion.div
      initial={reducir ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 1.4, ease: CURVA }}
      className="flex flex-col gap-3 rounded-[20px] border border-borde bg-superficie px-[22px] py-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-bold text-texto md:text-[17px]">Paso 2 · Ubicarlos en el mapa</p>
        <p className="shrink-0 text-[13.5px] font-semibold text-texto-suave">≈ 15 min</p>
      </div>
      <p className="text-[14px] text-texto-suave">Con el mapa se abren:</p>
      <div className="flex flex-wrap gap-2">
        {ABRE.map((a) => (
          <span key={a.texto} className="inline-flex items-center gap-1.5 rounded-full bg-superficie-hundida py-1.5 pr-3 pl-2.5 text-[13px] font-semibold text-texto">
            <Icono nombre={a.icono} tamano={16} />
            {a.texto}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

/** Celular (35, «Onboarding celu · Cierre»): una fila por campo y la franja de totales. */
function TusCamposCelu({ campos, total }: { campos: CampoOnb[]; total: ReturnType<typeof totales> }) {
  return (
    <section aria-label="Tus campos" className="flex shrink-0 flex-col gap-3 rounded-[22px] border border-borde bg-superficie p-4 md:hidden">
      <p className="text-[13px] font-bold text-texto-suave">Tus campos</p>
      {campos.map((c, i) => {
        const cab = c.potreros.reduce((s, p) => s + cabezasDe(p.contenido), 0)
        return (
          <div key={c.id} className="flex items-center gap-3">
            <MiniCampo potreros={c.potreros} demora={0.1 + i * 0.15} className="size-14 shrink-0" chico />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Tilde demora={0.5 + i * 0.1} />
                <p className="truncate font-heading text-[16px] font-extrabold text-texto">{c.nombre}</p>
              </div>
              <p className="truncate text-[12.5px] text-texto-suave">
                {c.tipo === 'propio' ? 'Propio' : 'Alquilado'} · {ha(c.hectareas)} ha · {c.potreros.length} potreros
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="titulo-display text-[24px] leading-none text-texto">
                <Cuenta hasta={cab} demora={0.6} />
              </span>
              <span className="text-[11.5px] text-texto-suave">cabezas</span>
            </div>
          </div>
        )
      })}
      <p className="rounded-xl bg-superficie-hundida px-3 py-2 text-center text-[13px] font-semibold text-texto">
        <Cuenta hasta={total.hectareas} demora={0.6} /> ha · <Cuenta hasta={total.potreros} demora={0.6} /> potreros ·{' '}
        <Cuenta hasta={total.cabezas} demora={0.6} /> cabezas
      </p>
    </section>
  )
}

export function Cierre({
  campos,
  celular,
  onSalir,
}: {
  campos: CampoOnb[]
  /** E.164 del dueño: «Mandame el link a la compu» le abre su propio chat. */
  celular: string | null
  onSalir: (destino: string) => Promise<void>
}) {
  const t = totales(campos)
  const primero = campos[0]!
  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const [mandado, setMandado] = useState(false)
  const alMapa = `/campos/${primero.id}`

  function mandarALaCompu() {
    const link = `${window.location.origin}${alMapa}`
    const texto = `Tropero: abrí este link en la compu para ubicar ${primero.nombre} en el mapa ${link}`
    const destino = celular ? celular.replace(/\D/g, '') : ''
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    setMandado(true)
  }

  const totalesItems = [
    { valor: t.hectareas, nombre: 'hectáreas' },
    { valor: t.potreros, nombre: 'potreros' },
    { valor: t.cabezas, nombre: 'cabezas' },
    { valor: campos.length, nombre: campos.length === 1 ? 'campo' : 'campos' },
  ]

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-fondo md:overflow-hidden">
      <header className="flex shrink-0 items-center px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-3 md:px-12 md:pt-[38px]">
        <Logo alto={30} className="hidden md:block" />
        <Logo alto={26} soloIsotipo className="md:hidden" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 px-[18px] pb-6 md:flex-row md:items-center md:gap-12 md:px-12 md:pb-12">
        {/* Tus campos */}
        <TusCamposCelu campos={campos} total={t} />
        <section
          aria-label="Tus campos"
          className="relative isolate hidden overflow-hidden rounded-[32px] bg-superficie-hundida p-[52px] md:block md:w-[57%] md:max-w-[820px] md:shrink-0"
        >
          <img src={textura} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-[0.18]" />
          <div className={cn('grid gap-x-10 gap-y-7', campos.length > 1 && 'md:grid-cols-2')}>
            {campos.map((c, i) => (
              <div key={c.id} className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Tilde demora={0.5 + i * 0.1} />
                    <h2 className="truncate font-heading text-[20px] font-extrabold text-texto md:text-[22px]">{c.nombre}</h2>
                  </div>
                  <p className="text-[13.5px] text-texto-suave md:text-[14px]">{resumenDe(c)}</p>
                </div>
                <MiniCampo
                  potreros={c.potreros}
                  demora={0.1 + i * 0.15}
                  className={cn('hidden md:block', campos.length > 1 ? 'h-[200px]' : 'h-[280px]')}
                />
                {c.potreros.length > POTREROS_A_LA_VISTA && (
                  <p className="text-[13.5px] font-semibold text-texto-suave md:text-[14px]">
                    y {c.potreros.length - POTREROS_A_LA_VISTA} potreros más
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-7 grid grid-cols-4 gap-2 rounded-[20px] bg-superficie px-4 py-4 md:px-7 md:py-5">
            {totalesItems.map((x) => (
              <div key={x.nombre} className="flex min-w-0 flex-col">
                <span className="titulo-display truncate text-[26px] leading-none text-texto md:text-[44px]">
                  <Cuenta hasta={x.valor} demora={0.6} />
                </span>
                <span className="mt-1 text-[12.5px] text-texto-suave md:text-[14px]">{x.nombre}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[14px] font-semibold text-texto-suave">
            <Icono nombre="Guardar" tamano={16} />
            Todo guardado · hoy {hora}
          </p>
        </section>

        {/* Panel */}
        <div className="flex w-full max-w-[476px] flex-col gap-[22px]">
          <Arranque />
          <h1 className="titulo-display text-[34px] leading-[1.02] text-texto md:text-[48px]">Tus campos están cargados.</h1>
          <p className="text-[15.5px] text-texto-suave md:text-[18px]">
            Quedaron guardados con sus potreros y su hacienda. El último paso es ubicarlos en el mapa: con eso se abre
            toda la app.
          </p>
          <LoQueSigue />

          {/* Compu: al mapa ahora. */}
          <div className="hidden flex-col gap-3 md:flex">
            <BotonPrincipal icono="Campos" onClick={() => void onSalir(alMapa)}>
              Ubicar {primero.nombre} en el mapa
            </BotonPrincipal>
            <BotonChico type="button" className="self-start" onClick={() => void onSalir('/')}>
              Después: queda esperando en el Inicio
            </BotonChico>
          </div>

          {/* Celular: el mapa se arma mejor en la compu. */}
          <div className="flex flex-col gap-3 md:hidden">
            {mandado ? (
              <div role="status" className="flex flex-col gap-1 rounded-[18px] bg-estado-bien-suave px-[18px] py-4">
                <p className="text-[14.5px] font-semibold text-estado-bien-texto">Listo, abrilo en la compu</p>
                <p className="text-[13.5px] text-estado-bien-texto">
                  Te quedó el link en tu WhatsApp. Mientras, en el Inicio te espera el paso pendiente.
                </p>
              </div>
            ) : (
              <BotonPrincipal icono="Mail" onClick={mandarALaCompu}>
                Mandame el link a la compu
              </BotonPrincipal>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <BotonChico type="button" onClick={() => void onSalir(alMapa)}>
                Armarlo acá en el celular
              </BotonChico>
              <BotonChico type="button" onClick={() => void onSalir('/')}>
                {mandado ? 'Ir al Inicio' : 'Después'}
              </BotonChico>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
