import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'
import { formatearCelularAR, normalizarCelularAR } from '@/lib/telefono'
import { cn } from '@/lib/utils'
import { AccesoLayout, Pregunta } from './acceso-layout'
import { CampoCelular } from './campo-celular'
import { codigoDeLoPegado, errorAlPedir, limpiarCodigo, mostrarCodigo } from './reglas'

/**
 * Cambiar mi número, desde ADENTRO (A5, decisión de Lau del 05/10): hace falta
 * estar con la sesión abierta y recibir un código en el número nuevo. Supabase
 * lo resuelve con updateUser({ phone }) + verifyOtp('phone_change'); el código
 * sale por el mismo hook de WhatsApp. La cuenta y la empresa no se tocan.
 */
export function CambiarNumeroPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paso, setPaso] = useState<'numero' | 'codigo' | 'listo'>('numero')
  const [celular, setCelular] = useState('')
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actual = user?.phone ? formatearCelularAR(`+${user.phone}`) : null
  const e164 = normalizarCelularAR(celular)
  const mismo = e164 !== null && user?.phone === e164.slice(1)

  async function mandar() {
    if (!e164 || mismo) return
    setOcupado(true)
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ phone: e164 })
    setOcupado(false)
    if (e) {
      const t = errorAlPedir(e)
      setError(
        e.message.toLowerCase().includes('already')
          ? 'Ese número ya es de otra cuenta.'
          : t.tipo === 'esperar'
            ? `Esperá ${t.segundos} segundos para pedir otro código.`
            : t.tipo === 'sin-senal'
              ? 'Sin señal. Para cambiar el número hace falta conexión.'
              : 'No pudimos mandar el código. Probá de nuevo en un rato.',
      )
      return
    }
    setPaso('codigo')
  }

  async function confirmar(valor: string) {
    if (!e164 || valor.length !== 6) return
    setOcupado(true)
    setError(null)
    const { error: e } = await supabase.auth.verifyOtp({ phone: e164, token: valor, type: 'phone_change' })
    setOcupado(false)
    if (e) {
      setCodigo('')
      setError('Ese código no es. Revisá el mensaje de WhatsApp que llegó al número nuevo.')
      return
    }
    setPaso('listo')
  }

  function escribir(texto: string) {
    const limpio = limpiarCodigo(texto)
    setCodigo(limpio)
    if (limpio.length === 6) void confirmar(limpio)
  }

  if (paso === 'listo' && e164) {
    return (
      <AccesoLayout tituloCompu="Tu campo no se pierde." tituloCelu="Número cambiado.">
        <div className="flex flex-col gap-2 rounded-[18px] bg-estado-bien-suave px-[18px] py-4" role="status">
          <p className="text-[14.5px] font-semibold text-estado-bien-texto">Listo, ya entrás con el número nuevo</p>
          <p className="text-[13.5px] text-estado-bien-texto">
            De ahora en más los códigos y los avisos del campo llegan al {formatearCelularAR(e164)}. Tu campo y
            tus datos siguen igual.
          </p>
        </div>
        <BotonPrincipal icono="Siguiente" onClick={() => navigate('/', { replace: true })}>
          Volver al campo
        </BotonPrincipal>
      </AccesoLayout>
    )
  }

  return (
    <AccesoLayout
      tituloCompu="Tu campo no se pierde."
      tituloCelu="Cambiar mi número."
      encabezado={{
        titulo: 'Cambiar mi número',
        bajada: actual
          ? `Hoy entrás con el ${actual}. Te mandamos un código al número nuevo para confirmar que es tuyo.`
          : 'Te mandamos un código al número nuevo para confirmar que es tuyo.',
      }}
    >
      {paso === 'numero' ? (
        <form
          className="contents"
          onSubmit={(ev) => {
            ev.preventDefault()
            void mandar()
          }}
        >
          <CampoCelular
            etiqueta="Tu número nuevo, el que tiene WhatsApp"
            valor={celular}
            onCambio={(v) => {
              setCelular(v)
              setError(null)
            }}
            error={mismo ? 'Es el mismo número con el que entrás hoy.' : (error ?? undefined)}
            autoFocus
          />
          <BotonPrincipal type="submit" icono="Celular" cargando={ocupado} disabled={!e164 || mismo || ocupado}>
            {ocupado ? 'Mandando el código…' : 'Mandame el código'}
          </BotonPrincipal>
        </form>
      ) : (
        <form
          className="contents"
          onSubmit={(ev) => {
            ev.preventDefault()
            void confirmar(codigo)
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="codigo-nuevo" className="text-[14px] font-semibold text-texto">
              El código que te mandamos al {e164 ? formatearCelularAR(e164) : ''}
            </label>
            <div
              className={cn(
                'rounded-2xl border-[1.5px] bg-superficie px-[18px] focus-within:border-principal',
                error ? 'border-estado-problema' : 'border-borde',
              )}
            >
              <input
                id="codigo-nuevo"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={mostrarCodigo(codigo)}
                onChange={(e) => escribir(e.target.value)}
                onPaste={(e) => {
                  const c = codigoDeLoPegado(e.clipboardData.getData('text'))
                  if (c) {
                    e.preventDefault()
                    escribir(c)
                  }
                }}
                className="cifra w-full bg-transparent py-3 text-[30px] font-bold tracking-[0.18em] text-texto outline-none"
              />
            </div>
            {error && <p className="text-[14px] text-estado-problema-texto" role="alert">{error}</p>}
          </div>
          <BotonPrincipal type="submit" icono="Guardar" cargando={ocupado} disabled={codigo.length !== 6 || ocupado}>
            {ocupado ? 'Cambiando…' : 'Cambiar el número'}
          </BotonPrincipal>
          <Pregunta texto="¿Te equivocaste de número?">
            <BotonChico
              type="button"
              onClick={() => {
                setPaso('numero')
                setCodigo('')
                setError(null)
              }}
            >
              Corregirlo
            </BotonChico>
          </Pregunta>
        </form>
      )}
      <Pregunta texto="¿Lo dejás como está?">
        <BotonChico type="button" onClick={() => navigate(-1)}>
          Volver
        </BotonChico>
      </Pregunta>
    </AccesoLayout>
  )
}
