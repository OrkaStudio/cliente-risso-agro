import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { useAuth } from '@/features/auth/auth-context'
import { formatearCelularAR, formatearMientrasEscribe, normalizarCelularAR } from '@/lib/telefono'
import { AccesoLayout, Preguntas, TarjetaWhatsApp } from './acceso-layout'
import { CampoCelular } from './campo-celular'
import { leerEnvio, marcarEnviado, pedirCodigo } from './envio'

type Estado = 'base' | 'mandando' | 'sin-cuenta' | 'sin-senal' | 'error'

/** A1 · Entrar: el celular y «Mandame el código». */
export function EntrarPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inicial = (location.state as { celular?: string } | null)?.celular ?? leerEnvio()?.celular ?? ''
  const [celular, setCelular] = useState(() =>
    inicial ? formatearMientrasEscribe(inicial) : '',
  )
  const [estado, setEstado] = useState<Estado>('base')

  if (!loading && session) return <Navigate to="/" replace />

  const e164 = normalizarCelularAR(celular)

  async function mandar() {
    if (!e164) return
    setEstado('mandando')
    const r = await pedirCodigo(e164)
    if (r.ok || r.error.tipo === 'esperar') {
      marcarEnviado(e164, {
        alta: false,
        esperaSegundos: r.ok ? undefined : r.error.tipo === 'esperar' ? r.error.segundos : undefined,
      })
      navigate('/login/codigo')
      return
    }
    setEstado(r.error.tipo === 'otro' ? 'error' : r.error.tipo)
  }

  function cambiarCelular(v: string) {
    setCelular(v)
    if (estado !== 'mandando') setEstado('base')
  }

  const principal = {
    base: { texto: 'Mandame el código', icono: 'Celular' as const, accion: mandar },
    mandando: { texto: 'Mandando el código…', icono: 'Celular' as const, accion: () => {} },
    'sin-cuenta': {
      texto: 'Crear la cuenta con este número',
      icono: 'Celular' as const,
      accion: () => navigate('/registro', { state: { celular: e164 } }),
    },
    'sin-senal': { texto: 'Probar de nuevo', icono: 'Reintentar' as const, accion: mandar },
    error: { texto: 'Probar de nuevo', icono: 'Reintentar' as const, accion: mandar },
  }[estado]

  return (
    <AccesoLayout
      tituloCompu="Tu campo, donde lo dejaste."
      tituloCelu="Entrá con tu celular."
      encabezado={{ titulo: 'Entrá a tu campo', bajada: 'Tus animales, tus potreros y tu plata.' }}
    >
      <form
        className="contents"
        onSubmit={(ev) => {
          ev.preventDefault()
          principal.accion()
        }}
      >
        <CampoCelular
          etiqueta="Tu celular, el que tiene WhatsApp"
          valor={celular}
          onCambio={cambiarCelular}
          invalido={estado === 'sin-cuenta'}
          autoFocus={!celular}
        />
        {estado === 'sin-cuenta' || estado === 'sin-senal' ? (
          <TarjetaWhatsApp tipo={estado} />
        ) : estado === 'error' ? (
          <TarjetaWhatsApp tipo="error" pie="No pudimos mandar el código. Probá de nuevo en un rato." />
        ) : (
          <TarjetaWhatsApp pie="Sin contraseñas que olvidar: cada vez que entrás desde una compu o un celular nuevo, te mandamos un código." />
        )}
        <BotonPrincipal
          type="submit"
          icono={principal.icono}
          cargando={estado === 'mandando'}
          disabled={!e164 || estado === 'mandando'}
        >
          {principal.texto}
        </BotonPrincipal>
      </form>
      <Preguntas
        filas={[
          ...(estado !== 'sin-cuenta'
            ? [
                {
                  texto: '¿Primera vez?',
                  boton: (
                    <BotonChico
                      type="button"
                      onClick={() => navigate('/registro', { state: { celular: e164 ?? undefined } })}
                    >
                      Creá tu cuenta
                    </BotonChico>
                  ),
                },
              ]
            : []),
          {
            texto: '¿Cambiaste de número?',
            boton: (
              <BotonChico type="button" onClick={() => navigate('/cambie-de-numero')}>
                Te ayudamos
              </BotonChico>
            ),
          },
        ]}
      />
      {estado === 'sin-cuenta' && e164 && (
        <p className="sr-only" role="status">
          {formatearCelularAR(e164)} no tiene cuenta.
        </p>
      )}
    </AccesoLayout>
  )
}
