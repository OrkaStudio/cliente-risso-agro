import { useEffect, useState } from 'react'
import type { Preparado } from '@/features/campo/cuenta-del-equipo'
import { Navigate, Outlet } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { AccesoPorWhatsapp } from './acceso-por-whatsapp'
import { useAuth } from './auth-context'
import { fijarCuentaDelPedido } from '@/features/empresa/cuenta-activa'
import { CargasDeOtraCuenta, ElegirCuentaPage } from '@/features/empresa/elegir-cuenta'
import { leerMembresiaPersistida, useCuentas, type Membresia } from '@/features/empresa/use-empresa'

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
/** `=== null` a propósito: una membresía guardada de antes no trae el campo. */
function onboardingPendiente(m: Membresia): boolean {
  return m.rol === 'dueno' && m.empresa?.onboarding_completo_at === null
}

export function RequireEmpresa() {
  const { user } = useAuth()
  const { data, isSuccess, isError, fetchStatus } = useCuentas()
  const membresia = data?.activa ?? null
  // Lo guardado en el teléfono para andar sin señal tiene que ser de esta cuenta (varias cuentas, 14/11).
  const caches = useCachesDeLaCuenta(isSuccess ? (membresia?.empresa_id ?? null) : null, data?.cuentas)

  // Consulta exitosa: la verdad del servidor manda.
  if (isSuccess) {
    if (!data.cuentas.length) return <Navigate to="/onboarding" replace />
    // Varias cuentas y ninguna elegida en este equipo: se pregunta, nunca se elige sola.
    if (!membresia) return <ElegirCuentaPage />
    // El dueño que dejó el onboarding por la mitad vuelve al paso donde quedó,
    // no a una app a medio cargar (regla de destino de Acceso).
    if (onboardingPendiente(membresia)) return <Navigate to="/onboarding" replace />
    // Invitado «Sólo por WhatsApp»: lo suyo no está en la app (permisos, 14/11).
    if (membresia.acceso === 'whatsapp') return <AccesoPorWhatsapp empresa={membresia.empresa?.nombre ?? null} otrasCuentas={data.cuentas.length > 1} />
    if (!caches) return <div className="h-full bg-fondo" aria-busy />
    if (!caches.listo) {
      const duena = data.cuentas.find((c) => c.empresa_id === caches.duena)
      return <CargasDeOtraCuenta cuantas={caches.cuantas} de={duena ?? null} a={membresia.empresa?.nombre ?? 'esta cuenta'} />
    }
    return <Outlet />
  }

  // Sin respuesta del servidor. La membresía guardada (visita previa con
  // señal) vale sólo cuando NO podemos preguntar: sin red, o la consulta
  // falló. Con red y consultando, esperamos — si entráramos con el dato
  // viejo, un usuario recién dado de baja de su empresa (o una cuenta de
  // prueba reseteada) vería la app un instante y después el rebote al
  // onboarding. Y sólo la de este usuario: otro que usó el mismo equipo no entra con ella.
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
  const guardada = leerMembresiaPersistida()
  const persistida = guardada && (!guardada.user_id || guardada.user_id === user?.id) ? guardada : null
  if (persistida && (sinRed || isError || fetchStatus !== 'fetching')) {
    fijarCuentaDelPedido(persistida.empresa_id)
    return onboardingPendiente(persistida) ? <Navigate to="/onboarding" replace /> : <Outlet />
  }

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
 * Lo guardado en el teléfono para el Modo Campo es de una cuenta: al entrar con
 * otra se vacía (ver `cuenta-del-equipo.ts`). Hasta que termina, no se muestra
 * nada, así no aparece un instante lo de la cuenta anterior. Si quedan cargas
 * sin subir de otra cuenta suya, no se entra (null = revisando).
 */
function useCachesDeLaCuenta(empresaId: string | null, cuentas: Membresia[] | undefined): Preparado | null {
  const [hecho, setHecho] = useState<{ empresaId: string; r: Preparado } | null>(null)
  const suyas = (cuentas ?? []).map((c) => c.empresa_id).join(',')
  useEffect(() => {
    if (!empresaId) return
    let vivo = true
    import('@/features/campo/cuenta-del-equipo')
      .then((m) => m.prepararParaLaCuenta(empresaId, suyas.split(',')))
      // Si el teléfono no deja revisar lo guardado, se entra igual: la base sólo deja ver esta cuenta.
      .catch((): Preparado => ({ listo: true }))
      .then((r) => vivo && setHecho({ empresaId, r }))
    return () => {
      vivo = false
    }
  }, [empresaId, suyas])
  return empresaId !== null && hecho?.empresaId === empresaId ? hecho.r : null
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
