import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { Logo } from '@/components/tropero/logo'
import { AvisoEstadoCampo } from '@/features/campo/estado-campo'
import { VIDRIO } from '@/features/campo/configuracion-celu'
import { useSeedOffline } from '@/features/campo/use-seed-offline'
import { prefetch, prefetchEnReposo, CHUNKS_CAMPO } from '@/lib/prefetch'
import { AsistentePanel } from '@/features/guia/asistente-panel'
import { cn } from '@/lib/utils'
import '@/features/campo/campo.css'
import grano from '@/assets/tropero/grano.png'
import { entraEnCelular, nivelDe } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'

/**
 * Shell del Modo Campo (móvil). Layout sobrio, pensado para el teléfono en la
 * manga/recorrida: header compacto + contenido scrolleable + nav inferior con
 * pulgar. El móvil ve SOLO campo: los 3 modos de captura viven en la nav de
 * abajo (pulgar) y el Historial (revisar/doble check) va en el header.
 */

// Inicio es el HUB: desde ahí el productor se reparte a las secciones y siempre
// puede volver. `end` = activo SOLO en /campo exacto (no en las sub-rutas).
const NAV: { to: string; label: string; icono: NombreIcono; end: boolean }[] = [
  { to: '/campo', label: 'Hoy', icono: 'Inicio', end: true },
  // La Recorrida sale de la barra (Lau, 17/11): lo que se ve en el campo se manda por audio.
  // La Manga vuelve después del lanzamiento (Lau, 16/11: sin bastón todavía).
  { to: '/campo/campos', label: 'Campos', icono: 'Campos', end: false },
  { to: '/campo/hacienda', label: 'Hacienda', icono: 'Hacienda', end: false },
  { to: '/campo/plata', label: 'Plata', icono: 'Plata', end: false },
]

/** Arriba, fijo en todo el celular (Lau, 19/11): el logo y el engranaje de Configuración.
 *  Flota sobre lo que scrollea, como la barra de troppero.com. */
function Encabezado() {
  const navigate = useNavigate()
  return (
    <div className="flex h-[58px] items-center justify-between rounded-full pr-[7px] pl-5">
      <Logo alto={22} />
      {/* Un botón (no un link): se hunde al tocarlo como todos (instalarHundir). */}
      <button
        type="button"
        onClick={() => navigate('/campo/configuracion')}
        aria-label="Configuración"
        className="grid size-11 place-items-center rounded-full bg-superficie text-terracota-900/80 shadow-[inset_0_0_0_1px_var(--borde)]"
      >
        <Icono nombre="Configuración" />
      </button>
    </div>
  )
}

/** Mide un elemento y deja su alto en una variable CSS del marco: las pantallas la usan
 *  para arrancar debajo del encabezado y terminar arriba de la barra. */
function useAlto(nombre: string) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const raiz = document.querySelector<HTMLElement>('.campo')
    if (!raiz) return
    if (!el) {
      raiz.style.setProperty(nombre, '0px')
      return
    }
    const medir = () => raiz.style.setProperty(nombre, `${el.offsetHeight}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => {
      ro.disconnect()
      raiz.style.setProperty(nombre, '0px')
    }
  }, [el, nombre])
  return setEl
}

/** La pastilla terracota de la sección elegida: viaja de una a otra. */
const RESORTE = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const

export function CampoShell() {
  const { data: membresia } = useEmpresa()
  // Precarga los chunks de las secciones en reposo → el salto a Recorrida/
  // Manga/Plata/Historial es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_CAMPO)), [])

  // Una sola instancia de la preparación offline para todo el Modo Campo. El
  // chip del header y el cajón de detalle son dos vistas del mismo estado, así
  // que vive acá y no adentro de ninguno de los dos.
  const seed = useSeedOffline()
  // El lugar del asistente en la barra de abajo (Lau, 18/11): el orbe se monta ahí.
  const [lugarAsistente, setLugarAsistente] = useState<HTMLDivElement | null>(null)
  // Lo que flota arriba y abajo deja su alto en --enc y --barra (ver useAlto).
  const medirArriba = useAlto('--enc')
  const medirAbajo = useAlto('--barra')
  // Configuración tiene su propio «Volver»: ahí no va el encabezado.
  const enConfig = useLocation().pathname.startsWith('/campo/configuracion')
  const mapaPendiente = useMapaPendiente()
  // Sólo lo que puede cargar (permisos, 13/11): Hoy lo tienen todos.
  // Mandar un audio: quien carga algo de los campos o la plata (lo demás no se carga por WhatsApp).
  const manda = (sec: 'campos' | 'plata') => ['carga', 'solo_manda'].includes(nivelDe(membresia, sec))
  const puedeMandar = manda('campos') || manda('plata')
  const navegables = NAV.filter(({ to }) => { return entraEnCelular(membresia, to) })

  return (
    <div className="campo relative isolate flex h-full flex-col overflow-hidden bg-[#fff8ec]">
      {/* El granulado de troppero.com sobre su crema (#fff8ec), sin la aurora (Lau, 17/11): fijo, no se mueve con lo que scrollea.
          En pantallas de 3x, 120px deja el grano igual de fino que en la landing. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-90 [background-size:120px_120px]" style={{ backgroundImage: `url(${grano})` }} />
      {/* Arriba, flotando sobre lo que scrollea (como troppero.com): el encabezado y, si
          algo pide atención, su franja. Detrás, un difuminado de la crema para que lo que
          sube no se corte de golpe contra el vidrio (la «tapa» de la landing, Lau 19/11). */}
      <div ref={medirArriba} className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        {/* En Configuración no hay encabezado: sin difuminado, que tapaba el título. */}
        {!enConfig && <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[calc(100%+28px)] bg-[linear-gradient(to_bottom,#fff8ec_0,rgb(255_248_236/.92)_55%,rgb(255_248_236/0))]" />}
        {!enConfig && <div className={cn('pointer-events-auto rounded-full', VIDRIO)}><Encabezado /></div>}
        {/* Sólo lo que pide atención se lleva una franja; acá baja además su detalle. */}
        <div className="pointer-events-auto">
          <AvisoEstadoCampo
            estado={seed.estado}
            lastOk={seed.lastOk}
            detalle={seed.detalle}
            online={seed.online}
            sembrar={() => void seed.sembrar()}
            abierto={false}
          />
        </div>
      </div>

      {/* Contenido — caja acotada (min-h-0 para que el flex hijo pueda encoger).
          Cada página se estructura como app: header fijo + región scrolleable
          interna + footer fijo. main NO scrollea; scrollea la región interna.
          `relative`: las hojas (CSheet) se posicionan contra esta caja. */}
      {/* Ocupa todo el alto: el encabezado y la barra flotan encima, y cada pantalla deja
          su lugar con --enc y --barra. */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="c-label p-6 !text-[13px]">Cargando…</div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Nav inferior (página 35): una píldora flotante; la sección activa, en
          un círculo terracota. Sin el mapa, sólo Hoy: lo demás necesita el campo. */}
      {/* En flujo (no flotando encima): así no tapa los pies fijos de la recorrida y la manga. */}
      {/* Con una sola sección (el que sólo mira Hoy), la barra no tiene a dónde llevar: no va. */}
      {/* El asistente acompaña todo el celular (Lau, 16/11). */}
      <AsistentePanel celular barra={lugarAsistente} />
      {(navegables.length > 1 || puedeMandar) && (
      <nav ref={medirAbajo} aria-label="Modo Campo" className="absolute inset-x-0 bottom-0 z-30 px-4 pt-2 pb-[max(14px,env(safe-area-inset-bottom))]">
        {/* El mismo difuminado que arriba, de abajo para arriba. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+28px)] bg-[linear-gradient(to_top,#fff8ec_0,rgb(255_248_236/.92)_55%,rgb(255_248_236/0))]" />
        {/* Vidrio como la barra de troppero.com; lo elegido, una pastilla terracota que viaja (Lau, 19/11). */}
        <div className={cn('flex items-center gap-0.5 rounded-full p-[5px]', VIDRIO)}>
          {navegables.map(({ to, label, icono, end }) => {
            const cerrada = mapaPendiente && to !== '/campo'
            return (
              <NavLink
                key={to}
                to={cerrada ? '/campo' : to}
                end={end}
                aria-disabled={cerrada || undefined}
                onPointerDown={() => {
                  const t = CHUNKS_CAMPO[to]
                  if (t) prefetch(t)
                }}
                className="relative flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-full"
              >
                {({ isActive }) => {
                  const esta = isActive && !cerrada
                  return (
                    <>
                      {esta && (
                        <motion.span
                          layoutId="pastilla-celu"
                          transition={RESORTE}
                          className="absolute inset-x-0 inset-y-[3px] rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/.22),inset_0_-1px_0_rgb(58_26_13/.18),0_4px_10px_-6px_rgb(152_75_37/.7)]"
                          style={{ background: 'linear-gradient(180deg, #c46a3a 0%, #b85c2e 55%, #a9532a 100%)' }}
                        />
                      )}
                      <span className={cn('relative transition-colors duration-200', esta ? 'text-trigo-300' : cerrada ? 'text-[#5c4e40]/35' : 'text-[#5c4e40]')}>
                        <Icono nombre={icono} />
                      </span>
                      <span className={cn('relative text-[11.5px] leading-none tracking-[-0.01em] transition-colors duration-200', esta ? 'font-bold text-white' : cerrada ? 'font-semibold text-[#5c4e40]/35' : 'font-semibold text-[#5c4e40]')}>
                        {label}
                      </span>
                    </>
                  )
                }}
              </NavLink>
            )
          })}
          {/* A la derecha del todo, el asistente (antes el audio, que ahora se manda desde adentro del asistente: Lau, 18/11). */}
          <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-terracota-900/10" />
          <div ref={setLugarAsistente} className="flex size-[58px] shrink-0" />
        </div>
      </nav>
      )}
    </div>
  )
}
