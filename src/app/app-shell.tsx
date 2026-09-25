import { Suspense, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { prefetch, prefetchEnReposo, CHUNKS_OFICINA } from '@/lib/prefetch'
import {
  BarChart3,
  Beef,
  CalendarClock,
  ChevronLeft,
  CircleDollarSign,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map as MapIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { AsistentePanel } from '@/features/guia/asistente-panel'
import { Invitacion } from '@/features/guia/invitacion'
import { Mision } from '@/features/guia/mision'
import { PuestaAPunto } from '@/features/guia/puesta-a-punto'
import { Spots } from '@/features/guia/spots'
import { ClimaSlot } from '@/features/cotizaciones/clima-slot'
import { GordoSlot } from '@/features/cotizaciones/gordo-slot'
import { useDolarBlue } from '@/features/cotizaciones/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { MARCA } from '@/lib/marca'
import { cn } from '@/lib/utils'
import { contarHoy, useParaAtender } from '@/features/inicio/para-atender-api'

function fechaHoy(): string {
  const s = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const TickerDivider = () => <span className="h-6 w-px bg-sidebar-border" />

/** Strip de mercado: gordo (manual), dólar blue (dolarapi) y clima
 *  (open-meteo). Si una fuente falla, no muestra ese dato (nunca un valor
 *  de muestra). Los slots presentes se separan con un divisor. */
function Ticker() {
  const blue = useDolarBlue()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''

  const slots: ReactNode[] = [
    empresaId ? <GordoSlot key="gordo" empresaId={empresaId} /> : null,
    blue.data ? (
      <div
        key="blue"
        className="flex shrink-0 items-center gap-2"
        title={`Dólar Blue — compra $${blue.data.compra.toLocaleString('es-AR')} · venta $${blue.data.venta.toLocaleString('es-AR')}`}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
          <CircleDollarSign className="size-[15px] text-[#2fd58b]" />
          Blue
        </span>
        <b className="tnum text-sm font-semibold text-white">
          ${blue.data.venta.toLocaleString('es-AR')}
        </b>
      </div>
    ) : null,
    // El slot del clima decide solo si tiene algo que mostrar (campo elegido
    // con ubicación y respuesta de Open-Meteo) o si pide ubicar el campo.
    <ClimaSlot key="clima" />,
  ].filter(Boolean)

  return (
    <div className="ml-auto flex min-w-0 items-center gap-3 overflow-hidden text-sidebar-foreground">
      {slots.map((slot, i) => (
        <div key={i} className="flex items-center gap-3">
          {i > 0 && <TickerDivider />}
          {slot}
        </div>
      ))}
    </div>
  )
}

/**
 * Layout del área autenticada (Modo Oficina, escritorio).
 * Sidebar fijo (colapsable) + topbar; sólo el contenido scrollea.
 * Guía visual: design/dashboard-agro-ai.html. El Modo Campo
 * (Recorrida/Clima) es mobile y vive aparte; acá solo Oficina.
 */

const NAV = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/hacienda', label: 'Hacienda', icon: Beef, end: false },
  { to: '/campos', label: 'Campos', icon: MapIcon, end: false },
  { to: '/analitica', label: 'Analítica', icon: BarChart3, end: false },
  { to: '/agenda', label: 'Agenda', icon: CalendarClock, end: false },
]

function initials(email?: string) {
  return email ? email.slice(0, 1).toUpperCase() : 'R'
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { data: membresia } = useEmpresa()

  /* Una sola consulta compartida con el Inicio (misma queryKey): el contador y la
   * cabecera "Hoy" no pueden decir números distintos. */
  const hoy = contarHoy(useParaAtender().data)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('side-collapsed') === '1',
  )
  // Recién llegó del onboarding: la barra ya se formó en su lugar (ver
  // `HaciaLaBarra`), así que aparece al instante; lo de adentro, el
  // encabezado y el contenido entran con un fundido escalonado.
  const location = useLocation()
  const quieto = useReducedMotion()
  const [bienvenida] = useState(
    () => !quieto && !!(location.state as { bienvenida?: boolean } | null)?.bienvenida,
  )
  const contenido = useRef<HTMLDivElement>(null)
  const contenidoListo = useEntradaDeTarjetas(bienvenida, contenido)
  const entra = (demora: number) =>
    bienvenida
      ? {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          // La misma curva y duración que la barra (ver `HaciaLaBarra`).
          transition: { duration: 0.62, delay: demora, ease: [0.65, 0, 0.35, 1] as const },
        }
      : {}

  // Precarga los chunks de las secciones en reposo → navegar entre Hacienda/
  // Campos/Analítica/Agenda es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_OFICINA)), [])
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem('side-collapsed', c ? '0' : '1')
      return !c
    })

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ===== Sidebar ===== */}
      <aside
        className={cn(
          'm-4 flex h-[calc(100%-2rem)] shrink-0 flex-col rounded-[20px] bg-sidebar text-sidebar-foreground shadow-[0_12px_40px_rgba(16,30,20,0.12)] transition-[width] duration-200 ease-out',
          collapsed ? 'w-[76px]' : 'w-[248px]',
        )}
      >
        <motion.div className="flex min-h-0 flex-1 flex-col" {...entra(0.05)}>
        {/* Marca + toggle */}
        <div className="flex items-center gap-3 px-4 pb-4 pt-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
            <Leaf className="size-5 text-white" strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-heading text-[17px] font-bold text-white">
                {MARCA}
              </div>
              <div className="truncate text-[11px] font-medium text-sidebar-foreground/55">
                Gestión de campo
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expandir' : 'Colapsar'}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white',
              collapsed && 'mx-auto',
            )}
          >
            <ChevronLeft
              className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
        </div>

        {/* Navegación (scrollea si no entra) */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">
          {!collapsed && (
            <div className="px-2 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/45">
              Oficina
            </div>
          )}
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              onMouseEnter={() => {
                const t = CHUNKS_OFICINA[to]
                if (t) prefetch(t)
              }}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-[10px] py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  isActive
                    ? 'bg-white/[0.07] text-white'
                    : 'text-sidebar-foreground/65 hover:bg-white/[0.05] hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <span className="absolute inset-y-[14%] left-0 w-[3px] rounded-full bg-lima" />
                  )}
                  <Icon
                    className={cn(
                      'size-5 shrink-0',
                      isActive ? 'text-lima' : 'text-sidebar-foreground/55',
                    )}
                    strokeWidth={1.75}
                  />
                  {!collapsed && <span>{label}</span>}
                  {/* Señala dónde mirar, no repite el contenido: descartamos una
                      campanita con panel propio porque duplicaba la verdad en dos
                      lugares (mismo problema que los cheques antes de la Agenda). */}
                  {to === '/' && hoy > 0 && (
                    <span
                      aria-label={`${hoy} para hoy`}
                      className={cn(
                        'tnum ml-auto shrink-0 rounded-full bg-lima px-1.5 py-0.5 text-[10.5px] font-bold leading-none text-ink',
                        collapsed && 'absolute right-1 top-1 ml-0 px-1',
                      )}
                    >
                      {hoy}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Usuario */}
        <div
          className={cn(
            'flex items-center border-t border-sidebar-border px-3 py-3',
            collapsed ? 'flex-col gap-2' : 'gap-2.5',
          )}
        >
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-[13px] font-bold text-white"
            title={collapsed ? user?.email : undefined}
          >
            {initials(user?.email)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold text-sidebar-foreground">
                {membresia?.empresa?.nombre ?? '—'}
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/55">
                {user?.email}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            title="Salir"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <LogOut className="size-[17px]" />
          </button>
        </div>
        </motion.div>
      </aside>

      {/* ===== Columna principal ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <motion.header {...entra(0.15)} className="m-4 mb-0 flex shrink-0 items-center gap-4 rounded-[20px] bg-sidebar px-6 py-3.5 text-sidebar-foreground shadow-[0_12px_40px_rgba(16,30,20,0.12)]">
          <div className="hidden shrink-0 font-heading text-sm font-semibold text-white sm:block">
            {fechaHoy()}
          </div>

          <Ticker />
        </motion.header>

        {/* Sólo el contenido scrollea. El padding inferior deja aire para la
            burbuja flotante del Asistente (no tapa la última card). */}
        <main className="flex-1 overflow-y-auto">
          <div
            ref={contenido}
            className="w-full px-4 pb-12 pt-7 sm:px-6"
            style={bienvenida && !contenidoListo ? { opacity: 0 } : undefined}
          >
            <Suspense
              fallback={
                <div className="text-sm text-muted-foreground">Cargando…</div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* El asistente enseña haciendo (TASK-063): la invitación una sola
          vez, la misión en curso pegada al botón real, y un puntito por
          panel la primera vez. Nada tapa la página. */}
      <Invitacion />
      <Mision />
      <Spots />

      {/* Panel del Asistente (preguntas + WhatsApp) + smart checklist */}
      <AsistentePanel />
      <PuestaAPunto />
    </div>
  )
}

/** La curva y la duración de la barra que se forma al salir del onboarding. */
const CURVA_BARRA = 'cubic-bezier(0.65, 0, 0.35, 1)'
const DURACION_BARRA = 620

/**
 * La página, al llegar del onboarding, entra con la misma fluidez que la
 * barra lateral: bloque por bloque (título, tarjetas, secciones), de arriba
 * abajo, con su curva. Nada aparece de golpe mientras lo otro se funde.
 *
 * Antes el contenedor hacía su fundido VACÍO y las tarjetas aparecían de
 * golpe después, cuando llegaban sus datos (1,28 s, 1,37 s, 1,54 s). Ahora la
 * página espera lista —datos cargados y el contenido quieto, hasta 1,8 s—
 * y recién ahí entra cada tarjeta. Las que llegan más tarde entran igual.
 * Genérico: no depende de cómo esté armada cada página.
 */
function useEntradaDeTarjetas(activo: boolean, raiz: RefObject<HTMLDivElement | null>): boolean {
  const qc = useQueryClient()
  const [listo, setListo] = useState(!activo)
  useEffect(() => {
    if (!activo) return
    const t0 = performance.now()
    let anterior = -1
    let quietos = 0
    const vistas = new WeakSet<Element>()
    let orden = 0
    const animar = (tarjetas: Element[]) => {
      for (const el of tarjetas) {
        if (vistas.has(el)) continue
        vistas.add(el)
        const i = Math.min(orden++, 8)
        ;(el as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: DURACION_BARRA, delay: i * 70, easing: CURVA_BARRA, fill: 'backwards' },
        )
      }
    }
    // Los BLOQUES de la página, en orden: títulos, tarjetas, secciones.
    // Se baja mientras haya un solo hijo (envoltorios) y se toman los hijos
    // de ahí: así entra todo lo que se ve, no sólo lo que parece tarjeta.
    const tarjetas = (): Element[] => {
      let nivel: Element | null | undefined = raiz.current?.firstElementChild
      while (nivel && nivel.children.length === 1) nivel = nivel.firstElementChild
      if (!nivel) return []
      return [...nivel.children].filter((e) => e.getBoundingClientRect().height > 8)
    }
    let mo: MutationObserver | null = null
    let primeraTarjeta = 0
    const intervalo = window.setInterval(() => {
      const n = tarjetas().length
      if (n > 0 && !primeraTarjeta) primeraTarjeta = performance.now()
      // Quietas y con los datos cargados; datos secundarios (el clima) no
      // hacen esperar más de 250 ms desde que aparece la primera tarjeta.
      const datos = qc.isFetching() === 0 || performance.now() - primeraTarjeta > 250
      quietos = n > 0 && n === anterior && datos ? quietos + 1 : 0
      anterior = n
      if (quietos >= 2 || performance.now() - t0 > 1800) {
        window.clearInterval(intervalo)
        animar(tarjetas())
        setListo(true)
        // Lo que aparece en el siguiente segundo y medio entra igual.
        mo = new MutationObserver(() => animar(tarjetas()))
        if (raiz.current) mo.observe(raiz.current, { childList: true, subtree: true })
        window.setTimeout(() => mo?.disconnect(), 1500)
      }
    }, 60)
    return () => {
      window.clearInterval(intervalo)
      mo?.disconnect()
    }
  }, [activo, qc, raiz])
  return listo
}
