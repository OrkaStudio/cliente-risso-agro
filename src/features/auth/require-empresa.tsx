import { useEffect, useState } from 'react'
import type { Preparado } from '@/features/campo/cuenta-del-equipo'
import { Navigate, Outlet } from 'react-router-dom'
import { PantallaCargando } from '@/components/tropero/cargando'
import { PantallaAviso } from '@/app/pantalla-aviso'
import { AccesoPorWhatsapp } from './acceso-por-whatsapp'
import { useAuth } from './auth-context'
import { fijarCuentaDelPedido } from '@/features/empresa/cuenta-activa'
import { CargasDeOtraCuenta, ElegirCuentaPage } from '@/features/empresa/elegir-cuenta'
import { leerMembresiaPersistida, useCuentas, type Membresia } from '@/features/empresa/use-empresa'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'

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
/**
 * Por qué falló la consulta de cuentas (18/11). Antes todo fallo caía en «sin señal»: con
 * la sesión vencida o un error del servidor, alguien con internet veía «Falta bajar tu
 * campo». Ahora «sin señal» es sólo cuando de verdad no hay red.
 */
function motivoDelFallo(error: unknown, sinRed: boolean): 'red' | 'sesion' | 'otro' {
  if (sinRed) return 'red'
  const e = (error ?? {}) as { code?: string; message?: string; status?: number }
  // Sin sesión válida la base contesta como a un anónimo (42501) o con el token vencido (PGRST301/302).
  if (e.status === 401 || ['42501', 'PGRST301', 'PGRST302'].includes(e.code ?? '') || /jwt/i.test(e.message ?? '')) return 'sesion'
  // El pedido ni salió: es la red, aunque el teléfono diga que tiene.
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(e.message ?? '')) return 'red'
  return 'otro'
}

/** `=== null` a propósito: una membresía guardada de antes no trae el campo. */
function onboardingPendiente(m: Membresia): boolean {
  return m.rol === 'dueno' && m.empresa?.onboarding_completo_at === null
}

export function RequireEmpresa() {
  const { user } = useAuth()
  const { data, isSuccess, isError, error, fetchStatus, refetch } = useCuentas()
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
  const motivo = isError ? motivoDelFallo(error, sinRed) : null
  // La sesión ya no vale: aunque haya una cuenta guardada, adentro todo fallaría. Se vuelve a entrar.
  if (motivo === 'sesion') return <SesionCerrada />
  const guardada = leerMembresiaPersistida()
  const persistida = guardada && (!guardada.user_id || guardada.user_id === user?.id) ? guardada : null
  if (persistida && (sinRed || isError || fetchStatus !== 'fetching')) {
    fijarCuentaDelPedido(persistida.empresa_id)
    return onboardingPendiente(persistida) ? <Navigate to="/onboarding" replace /> : <Outlet />
  }

  // Buscando activamente con red: esperar.
  if (fetchStatus === 'fetching') return <PantallaCargando />

  // Con red y un error que no es de la sesión: lo decimos como error, con cómo avisarnos.
  if (motivo === 'otro') return <FalloAlCargar onReintentar={() => void refetch()} />

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
/** La sesión venció o la cerraron en otro lado: se entra de nuevo con el código de WhatsApp. */
function SesionCerrada() {
  const { signOut } = useAuth()
  return (
    <PantallaAviso
      pantallaEntera
      conImagen={false}
      titulo="Tu sesión se cerró"
      texto="Cada tanto hay que volver a entrar. Te mandamos un código por WhatsApp y seguís donde estabas."
      etiqueta={{ texto: 'Hay que entrar de nuevo', tono: 'trigo' }}
      subrayar="se cerró"
      accion="Entrar de nuevo"
      icono="Candado"
      onAccion={() => void signOut().finally(() => window.location.assign('/login'))}
    />
  )
}

/** Con señal, la consulta falló por otra cosa: probar de nuevo o avisarnos. */
function FalloAlCargar({ onReintentar }: { onReintentar: () => void }) {
  return (
    <PantallaAviso
      pantallaEntera
      conImagen={false}
      titulo="Algo no cargó"
      texto="Tus datos están bien guardados. Probá de nuevo; si sigue pasando, avisanos y lo miramos."
      etiqueta={{ texto: 'No pudimos traer tu cuenta', tono: 'rojo' }}
      animo="piensa"
      subrayar="cargó"
      accion="Volver a intentar"
      icono="Reintentar"
      onAccion={onReintentar}
      whatsapp={{ texto: 'Avisarnos por WhatsApp', href: `https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent('Hola, Troppero no me carga la cuenta.')}` }}
    />
  )
}

function SinConexionEmpresa() {
  return (
    <PantallaAviso
      pantallaEntera
      conImagen={false}
      titulo="Falta bajar tu campo"
      texto="La primera vez se baja con señal; después anda aunque no tengas. Buscá un lugar con señal y probá de nuevo."
      etiqueta={{ texto: 'Sin señal', tono: 'gris' }}
      animo="duerme"
      subrayar="tu campo"
      accion="Probar de nuevo"
      icono="Reintentar"
      onAccion={() => window.location.reload()}
    />
  )
}
