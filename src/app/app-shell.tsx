import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Beef,
  ChevronLeft,
  CircleDollarSign,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map as MapIcon,
  Sprout,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

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
    <div className="flex h-svh overflow-hidden bg-background">
      {/* ===== Sidebar ===== */}
      <aside
        className={cn(
          'm-4 flex h-[calc(100svh-2rem)] shrink-0 flex-col rounded-[20px] bg-sidebar text-sidebar-foreground shadow-[0_12px_40px_rgba(16,30,20,0.12)] transition-[width] duration-200 ease-out',
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

        {/* Widget "Hoy" — chrome del layout. Datos de muestra hasta
            conectar clima (Open-Meteo) y alertas reales. */}
        {!collapsed && (
          <div className="mx-3 mb-2 flex flex-col gap-2.5 rounded-2xl border border-sidebar-border bg-white/[0.05] p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/45">
              Hoy en el campo
            </div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-sidebar-foreground">
              <Sun className="size-[15px] shrink-0 text-[#e8b75c]" />
              <b className="font-bold">24°</b> · sin lluvia prevista
            </div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-sidebar-foreground">
              <Sprout className="size-[15px] shrink-0 text-lima" />
              Pulverización: <b className="font-bold">ventana OK</b>
            </div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#e8b75c]">
              <TriangleAlert className="size-[15px] shrink-0" />
              <b className="font-bold">4</b> requieren atención
            </div>
          </div>
        )}

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
          <button
            type="button"
            className="flex shrink-0 items-center gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.08] px-4 py-2 font-heading text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
          >
            Toda la empresa
            <span className="text-[10px] text-sidebar-foreground/55">▾</span>
          </button>

          {/* Ticker — se reduce en pantallas medianas. Datos de muestra
              hasta conectar dólar/precio/clima. */}
          <div className="ml-auto flex min-w-0 items-center gap-4 overflow-hidden text-sidebar-foreground">
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                <Beef className="size-[15px] text-[#d4b896]" />
                Gordo
              </span>
              <b className="tnum text-sm font-semibold text-white">$4.373</b>
              <span className="text-xs text-[#2fd58b]">▲ 1,2%</span>
            </div>
            <span className="hidden h-6 w-px bg-sidebar-border lg:block" />
            <div className="hidden shrink-0 items-center gap-2 xl:flex">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                <CircleDollarSign className="size-[15px] text-[#2fd58b]" />
                Blue
              </span>
              <b className="tnum text-sm font-semibold text-white">$1.180</b>
              <span className="text-xs text-[#ef8d7b]">▼ 0,4%</span>
            </div>
            <span className="hidden h-6 w-px bg-sidebar-border xl:block" />
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                <Sun className="size-[15px] text-[#e8b75c]" />
                Clima
              </span>
              <b className="text-sm font-semibold text-white">24°</b>
            </div>
          </div>
        </header>

        {/* Sólo el contenido scrollea */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1340px] px-6 py-7">
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
