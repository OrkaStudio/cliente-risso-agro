import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Layout del área autenticada (Modo Oficina, escritorio).
 * Por ahora un header mínimo + el contenido. Crece con la navegación
 * de secciones (Dashboard / Hacienda / Analítica…) en próximos tracks.
 */
export function AppShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-heading text-lg font-semibold">Risso Agro</span>
          <nav className="flex items-center gap-4 text-sm">
            {[
              { to: '/', label: 'Inicio', end: true },
              { to: '/hacienda', label: 'Hacienda', end: false },
              { to: '/campos', label: 'Campos', end: false },
              { to: '/analitica', label: 'Analítica', end: false },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'text-muted-foreground hover:text-foreground',
                    isActive && 'font-medium text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Salir
          </Button>
        </div>
      </header>
      <main className="p-6">
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">Cargando…</div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
