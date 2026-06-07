import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'

/**
 * Guard de rutas. Mientras resuelve la sesión muestra un placeholder
 * (evita redirigir a /login por un instante antes de leer localStorage).
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}
