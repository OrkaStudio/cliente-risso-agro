import { Navigate, Outlet } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { leerMembresiaPersistida, useEmpresa } from '@/features/empresa/use-empresa'

/**
 * Guard de membresía: un usuario autenticado sin empresa (recién registrado)
 * va al onboarding antes de ver cualquier sección. Corre adentro de
 * ProtectedRoute, así que acá ya hay sesión.
 *
 * Tolerante a offline: sólo mandamos al onboarding cuando la consulta TUVO
 * ÉXITO y devolvió vacío (de verdad no tiene empresa). Si la consulta falla
 * por falta de red, usamos la última membresía conocida — así el que ya tiene
 * empresa entra al campo sin señal en vez de rebotar al onboarding.
 * Ver [[clientes/risso-agro/tareas/TASK-042-2026-07-15]].
 */
export function RequireEmpresa() {
  const { data: membresia, isSuccess, isError, fetchStatus } = useEmpresa()

  // Consulta exitosa: la verdad del servidor manda.
  if (isSuccess) {
    if (!membresia) return <Navigate to="/onboarding" replace />
    return <Outlet />
  }

  // Sin respuesta del servidor. La membresía guardada (visita previa con
  // señal) vale sólo cuando NO podemos preguntar: sin red, o la consulta
  // falló. Con red y consultando, esperamos — si entráramos con el dato
  // viejo, un usuario recién dado de baja de su empresa (o una cuenta de
  // prueba reseteada) vería la app un instante y después el rebote al
  // onboarding.
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
  const persistida = leerMembresiaPersistida()
  if (persistida && (sinRed || isError || fetchStatus !== 'fetching')) return <Outlet />

  // Buscando activamente con red: esperar.
  if (fetchStatus === 'fetching') {
    return (
      <div className="flex min-h-full items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  // Sin red y sin membresía conocida (nunca cargó con señal en este equipo).
  return <SinConexionEmpresa />
}

/**
 * Sin red y sin membresía conocida (nunca cargó la app con señal en este
 * dispositivo). No podemos saber si tiene empresa → pedimos conexión una vez.
 */
function SinConexionEmpresa() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <WifiOff className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Necesitás conexión la primera vez para cargar tu campo. Conectate un
        momento y volvé a abrir la app.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Reintentar
      </button>
    </div>
  )
}
