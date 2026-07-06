import { Suspense } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Banknote, Leaf, LogOut, Footprints, Syringe } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { setForceOficina } from '@/lib/campo-mode'
import { cn } from '@/lib/utils'

/**
 * Shell del Modo Campo (móvil). Layout sobrio, pensado para el teléfono en la
 * manga/recorrida: header compacto + contenido scrolleable + nav inferior con
 * pulgar. Solo expone las secciones de campo; un link discreto a "Oficina"
 * deja escaparse al Modo Oficina cuando hace falta.
 */

const NAV = [
  { to: '/campo/manga', label: 'Manga', icon: Syringe, soon: false },
  { to: '/campo/recorrida', label: 'Recorrida', icon: Footprints, soon: false },
  { to: '/campo/plata', label: 'Plata', icon: Banknote, soon: false },
] as const

export function CampoShell() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const irAOficina = () => {
    setForceOficina(true)
    navigate('/')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary">
          <Leaf className="size-5 text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-heading text-[15px] font-bold text-white">
            Risso Agro
          </div>
          <div className="truncate text-[11px] font-medium text-sidebar-foreground/55">
            Modo Campo
          </div>
        </div>
        <button
          type="button"
          onClick={irAOficina}
          className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          Oficina
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          title="Salir"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <LogOut className="size-[17px]" />
        </button>
      </header>

      {/* Contenido — caja acotada (min-h-0 para que el flex hijo pueda encoger).
          Cada página se estructura como app: header fijo + región scrolleable
          interna + footer fijo. main NO scrollea; scrollea la región interna. */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Nav inferior (pulgar) */}
      <nav className="flex shrink-0 items-stretch border-t border-border bg-card">
        {NAV.map(({ to, label, icon: Icon, soon }) =>
          soon ? (
            <div
              key={to}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-muted-foreground/45"
              title="Próximamente"
            >
              <Icon className="size-[22px]" strokeWidth={1.75} />
              <span className="text-[11px] font-medium">{label}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide">
                pronto
              </span>
            </div>
          ) : (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-[22px]" strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
