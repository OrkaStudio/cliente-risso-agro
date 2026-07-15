import { Navigate, Outlet } from 'react-router-dom'
import { useEmpresa } from '@/features/empresa/use-empresa'

/**
 * Guard de membresía: un usuario autenticado sin empresa (recién registrado)
 * va al onboarding antes de ver cualquier sección. Corre adentro de
 * ProtectedRoute, así que acá ya hay sesión.
 */
export function RequireEmpresa() {
  const { data: membresia, isLoading } = useEmpresa()

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!membresia) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
