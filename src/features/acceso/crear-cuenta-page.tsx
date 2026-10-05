import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { useAuth } from '@/features/auth/auth-context'
import { formatearMientrasEscribe, normalizarCelularAR } from '@/lib/telefono'
import { useIsMobile } from '@/lib/use-is-mobile'
import { AccesoLayout, Pregunta, TarjetaWhatsApp } from './acceso-layout'
import { CampoCelular } from './campo-celular'
import { celularTieneCuenta, marcarEnviado, pedirCodigo } from './envio'
import { mailValido, separarNombre } from './reglas'

/** A3 · Crear cuenta: nombre, celular y mail si quiere. Sin contraseña. */
export function CrearCuentaPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const movil = useIsMobile()
  const inicial = (location.state as { celular?: string } | null)?.celular ?? ''

  const [nombreCompleto, setNombreCompleto] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [celular, setCelular] = useState(() => (inicial ? formatearMientrasEscribe(inicial) : ''))
  const [mail, setMail] = useState('')
  const [intento, setIntento] = useState(false)
  const [yaTiene, setYaTiene] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  const e164 = normalizarCelularAR(celular)
  const datosNombre = movil ? separarNombre(nombreCompleto) : { nombre: nombre.trim(), apellido: apellido.trim() }
  const errores = {
    nombre: !datosNombre.nombre ? 'Falta tu nombre.' : null,
    celular: !e164 ? 'Escribí el número con la característica, sin el 0 ni el 15.' : null,
    mail: !mailValido(mail) ? 'Ese mail no parece completo. Revisalo o dejalo vacío.' : null,
  }
  const valido = !errores.nombre && !errores.celular && !errores.mail

  async function seguir() {
    setIntento(true)
    setFallo(null)
    if (!valido || !e164) return
    setMandando(true)
    if (await celularTieneCuenta(e164)) {
      setYaTiene(true)
      setMandando(false)
      return
    }
    const r = await pedirCodigo(e164, { ...datosNombre, mail })
    setMandando(false)
    if (r.ok || r.error.tipo === 'esperar') {
      marcarEnviado(e164, {
        alta: true,
        esperaSegundos: r.ok ? undefined : r.error.tipo === 'esperar' ? r.error.segundos : undefined,
      })
      navigate('/login/codigo')
      return
    }
    setFallo(
      r.error.tipo === 'sin-senal'
        ? 'Sin señal. Para crear la cuenta hace falta conexión.'
        : 'No pudimos mandar el código. Probá de nuevo en un rato.',
    )
  }

  const errorDe = (k: keyof typeof errores) => (intento ? (errores[k] ?? undefined) : undefined)

  return (
    <AccesoLayout
      tituloCompu="En un minuto arrancás."
      tituloCelu="En un minuto arrancás."
      encabezado={{
        titulo: 'Creá tu cuenta',
        bajada: 'Sin contraseñas: entrás con un código que te llega por WhatsApp.',
      }}
    >
      <form
        className="contents"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          void seguir()
        }}
      >
        {movil ? (
          <CampoTexto
            etiqueta="Tu nombre"
            autoComplete="name"
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            error={errorDe('nombre')}
            autoFocus
          />
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            <CampoTexto
              etiqueta="Nombre"
              autoComplete="given-name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              error={errorDe('nombre')}
              autoFocus
            />
            <CampoTexto
              etiqueta="Apellido"
              autoComplete="family-name"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
            />
          </div>
        )}
        <CampoCelular
          etiqueta={movil ? 'Tu celular' : 'Tu celular, el que tiene WhatsApp'}
          valor={celular}
          onCambio={(v) => {
            setCelular(v)
            setYaTiene(false)
          }}
          ayuda={movil ? undefined : 'Acá te llega el código para entrar y los avisos del campo.'}
          error={yaTiene ? 'Ese número ya tiene cuenta.' : errorDe('celular')}
        >
          {yaTiene && (
            <BotonChico
              type="button"
              className="self-start"
              onClick={() => navigate('/login', { state: { celular: e164 } })}
            >
              Entrar con este número
            </BotonChico>
          )}
        </CampoCelular>
        <CampoTexto
          etiqueta="Tu mail, si querés"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          ayuda={
            movil
              ? 'Para las facturas del plan y lo que pida tu contador.'
              : 'Para mandarte las facturas del plan y lo que pida tu contador.'
          }
          error={errorDe('mail')}
        />
        {fallo && <TarjetaWhatsApp tipo="error" pie={fallo} />}
        <BotonPrincipal type="submit" icono="Celular" cargando={mandando} disabled={mandando}>
          {mandando ? 'Mandando el código…' : 'Seguir, mandame el código'}
        </BotonPrincipal>
      </form>
      <Pregunta texto="¿Ya tenés cuenta?">
        <BotonChico type="button" onClick={() => navigate('/login', { state: { celular: e164 ?? undefined } })}>
          Entrá
        </BotonChico>
      </Pregunta>
    </AccesoLayout>
  )
}
