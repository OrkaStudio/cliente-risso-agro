import { Suspense, type ReactNode, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Beef,
  ChevronLeft,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map as MapIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { ClimaSlot } from '@/features/cotizaciones/clima-slot'
import { GordoSlot } from '@/features/cotizaciones/gordo-slot'
import { useClima, useDolarBlue } from '@/features/cotizaciones/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { cn } from '@/lib/utils'

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
  const clima = useClima()
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
    clima.data ? <ClimaSlot key="clima" /> : null,
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
  { to: '/cheques', label: 'Cheques', icon: Landmark, end: false },
]

function initials(email?: string) {
  return email ? email.slice(0, 1).toUpperCase() : 'R'
}

export function AppShell() {
  const { user, signOut } = useAuth()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('side-collapsed') === '1',
  )
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
        {/* Marca + toggle */}
        <div className="flex items-center gap-3 px-4 pb-4 pt-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
            <Leaf className="size-5 text-white" strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-heading text-[17px] font-bold text-white">
                Risso Agro
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
                Risso
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
      </aside>

      {/* ===== Columna principal ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="m-4 mb-0 flex shrink-0 items-center gap-4 rounded-[20px] bg-sidebar px-6 py-3.5 text-sidebar-foreground shadow-[0_12px_40px_rgba(16,30,20,0.12)]">
          <div className="hidden shrink-0 font-heading text-sm font-semibold text-white sm:block">
            {fechaHoy()}
          </div>

          <Ticker />
        </header>

        {/* Sólo el contenido scrollea */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full px-4 py-7 sm:px-6">
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
    </div>
  )
}
