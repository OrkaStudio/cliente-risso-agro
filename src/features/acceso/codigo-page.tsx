import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { formatearCelularAR } from '@/lib/telefono'
import { cn } from '@/lib/utils'
import { AccesoLayout, Preguntas } from './acceso-layout'
import { CampoCodigo } from './campo-codigo'
import { aceptarInvitacion, borrarEnvio, guardarEnvio, leerEnvio, marcarEnviado, pedirCodigo, verificarCodigo, type Envio } from './envio'
import {
  codigoDeLoPegado,
  estadoDelCodigo,
  limpiarCodigo,
  relojMinutos,
  segundosParaReenviar,
  WHATSAPP_TROPERO,
} from './reglas'

/** El reloj de la pantalla: avanza cada segundo para el contador y el vencimiento. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return ahora
}

/** A2 · El código. */
export function CodigoPage() {
  const [envio, setEnvio] = useState<Envio | null>(leerEnvio)
  if (!envio) return <Navigate to="/login" replace />
  return <Codigo envio={envio} onEnvio={(e) => (guardarEnvio(e), setEnvio(e))} />
}

function Codigo({ envio, onEnvio }: { envio: Envio; onEnvio: (e: Envio) => void }) {
  const navigate = useNavigate()
  const ahora = useAhora()
  const [codigo, setCodigo] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const estado = estadoDelCodigo(envio.enviadoMs, envio.fallidos, ahora)
  const vencido = estado.tipo === 'vencido'
  const faltan = segundosParaReenviar(envio.enviadoMs, ahora)
  const numero = formatearCelularAR(envio.celular)

  async function entrar(valor: string) {
    if (valor.length !== 6 || vencido || entrando) return
    setEntrando(true)
    setAviso(null)
    const r = await verificarCodigo(envio.celular, valor)
    if (r === 'ok') {
      if (envio.invitacion) {
        // A4: el código probó que el número es suyo; ahora queda en la empresa.
        const a = await aceptarInvitacion(envio.invitacion)
        if (!a.ok) {
          setEntrando(false)
          setAviso(`Entraste, pero no pudimos sumarte a la empresa: ${a.mensaje}`)
          return
        }
      }
      borrarEnvio()
      // La regla de destino la aplican los guardas: sin empresa → onboarding.
      navigate('/', { replace: true })
      return
    }
    setEntrando(false)
    if (r === 'sin-senal') {
      setAviso('Sin señal. Probá de nuevo cuando tengas conexión: el código sigue valiendo.')
      return
    }
    setCodigo('')
    onEnvio({ ...envio, fallidos: envio.fallidos + 1 })
    campo.current?.focus()
  }

  function escribir(texto: string) {
    const limpio = limpiarCodigo(texto)
    setCodigo(limpio)
    if (limpio.length === 6) void entrar(limpio)
  }

  async function pegar() {
    try {
      const texto = await navigator.clipboard.readText()
      const encontrado = codigoDeLoPegado(texto)
      if (encontrado) {
        escribir(encontrado)
        return
      }
      setAviso('En lo que copiaste no hay un código de 6 números. Copialo del mensaje de WhatsApp.')
    } catch {
      // El navegador no deja leer el portapapeles: que lo pegue a mano.
      campo.current?.focus()
      setAviso('Mantené apretado el campo y elegí «Pegar».')
    }
  }

  async function mandarOtro() {
    setReenviando(true)
    setAviso(null)
    const r = await pedirCodigo(envio.celular)
    setReenviando(false)
    setCodigo('')
    if (r.ok || r.error.tipo === 'esperar') {
      // Código nuevo: el reloj y los intentos arrancan de cero.
      borrarEnvio()
      onEnvio(
        marcarEnviado(envio.celular, {
          alta: envio.alta,
          esperaSegundos: r.ok ? undefined : r.error.tipo === 'esperar' ? r.error.segundos : undefined,
        }),
      )
      return
    }
    setAviso(
      r.error.tipo === 'sin-senal'
        ? 'Sin señal. Probá de nuevo cuando tengas conexión.'
        : 'No pudimos mandar el código. Probá de nuevo en un rato.',
    )
  }

  const mensaje = vencido
    ? estado.motivo === 'tiempo'
      ? 'Pasaron más de 10 minutos y el código venció. Te mandamos uno nuevo con un toque.'
      : 'Probaste 3 veces y el código se anuló. Te mandamos uno nuevo con un toque.'
    : estado.tipo === 'incorrecto'
      ? `Ese código no es. Revisá el mensaje de WhatsApp: te ${estado.quedan === 1 ? 'queda 1 intento' : `quedan ${estado.quedan} intentos`}.`
      : null

  return (
    <AccesoLayout
      tituloCompu="Tu campo, donde lo dejaste."
      tituloCelu={vencido ? 'El código venció.' : 'Llegó por WhatsApp.'}
      encabezado={{
        titulo: vencido ? 'El código venció' : 'Llegó por WhatsApp',
        bajada: `Copiá los 6 números del mensaje que te mandamos al ${numero}.`,
      }}
    >
      <form
        className="contents"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (vencido) void mandarOtro()
          else void entrar(codigo)
        }}
      >
        <div className="flex flex-col gap-[7px] md:gap-2">
          <label htmlFor="codigo" className="text-[14px] font-semibold text-texto md:text-[14.5px]">
            <span className="md:hidden">El código que te mandamos al {numero}</span>
            <span className="hidden md:inline">El código</span>
          </label>
          <CampoCodigo
            ref={campo}
            id="codigo"
            valor={vencido ? '' : codigo}
            onCambio={escribir}
            error={!!mensaje}
            deshabilitado={vencido || entrando}
            vencido={vencido}
            describedBy="codigo-ayuda"
            autoFocus
          />
          {!vencido && (
            <div className="grid grid-cols-2 gap-2.5 pt-1.5">
              <BotonChico
                type="button"
                icono="Celular"
                className="w-full py-2.5 text-[14px]"
                onClick={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')}
              >
                Abrir WhatsApp
              </BotonChico>
              <BotonChico
                type="button"
                icono="Comprobante"
                className="w-full py-2.5 text-[14px]"
                onClick={() => void pegar()}
              >
                Pegar el código
              </BotonChico>
            </div>
          )}
          <p
            id="codigo-ayuda"
            role={mensaje || aviso ? 'alert' : undefined}
            className={cn(
              'pt-1 text-center text-[13.5px] text-pretty',
              mensaje || aviso ? 'text-estado-problema-texto' : 'text-texto-suave',
            )}
          >
            {aviso ?? mensaje ?? (
              <>
                <span className="md:hidden">
                  Vence en 10 minutos. Si estás en el campo sin señal, entrás igual con el celular que ya usabas.
                </span>
                <span className="hidden md:inline">
                  Vence en 10 minutos. En el celular se completa solo cuando llega el mensaje.
                </span>
              </>
            )}
          </p>
        </div>
        {vencido ? (
          <BotonPrincipal type="submit" icono="Reintentar" cargando={reenviando} disabled={reenviando}>
            Mandame uno nuevo
          </BotonPrincipal>
        ) : (
          <BotonPrincipal type="submit" icono="Siguiente" cargando={entrando} disabled={codigo.length !== 6 || entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </BotonPrincipal>
        )}
      </form>
      {!vencido && (
        <Preguntas
          filas={[
            {
              texto: '¿No llegó?',
              boton: (
                <BotonChico type="button" disabled={faltan > 0 || reenviando} onClick={() => void mandarOtro()}>
                  {faltan > 0 ? `Mandarlo de nuevo en ${relojMinutos(faltan)}` : 'Mandarlo de nuevo'}
                </BotonChico>
              ),
            },
          ]}
        />
      )}
    </AccesoLayout>
  )
}
