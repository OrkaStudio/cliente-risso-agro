import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { formatearCelularAR } from '@/lib/telefono'
import { AccesoLayout, TarjetaWhatsApp } from './acceso-layout'
import { leerInvitacion, marcarEnviado, pedirCodigo, type Invitacion } from './envio'

// Lo que ve cada rol al entrar (A4). La 35 sólo diseña la veterinaria; el resto
// sigue el mismo tono y se ajusta cuando se definan los permisos por rol.
const ROLES: Record<Invitacion['rol'], { etiqueta: string; puede: string }> = {
  vet: { etiqueta: 'Veterinaria', puede: 'Cargar sanidad y tacto en la manga' },
  encargado: { etiqueta: 'Encargado', puede: 'Recorrer, cargar la manga y la hacienda' },
  peon: { etiqueta: 'Peón', puede: 'Hacer la recorrida y la manga' },
}

type Carga = { tipo: 'cargando' } | { tipo: 'sin-senal' } | { tipo: 'no-existe' } | { tipo: 'lista'; inv: Invitacion }

/** A4 · Te invitaron: el link que manda el dueño desde Personas. */
export function TeInvitaronPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' })
  const [mandando, setMandando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void leerInvitacion(token).then((r) => {
      if (!vivo) return
      if (r === 'sin-senal') setCarga({ tipo: 'sin-senal' })
      else if (!r) setCarga({ tipo: 'no-existe' })
      else setCarga({ tipo: 'lista', inv: r })
    })
    return () => {
      vivo = false
    }
  }, [token])

  if (carga.tipo === 'cargando') {
    return (
      <AccesoLayout tituloCompu="Te esperan en el campo." tituloCelu="Te esperan en el campo.">
        <p className="text-[14.5px] text-texto-suave" role="status">
          Buscando la invitación…
        </p>
      </AccesoLayout>
    )
  }

  if (carga.tipo !== 'lista' || carga.inv.vencida || carga.inv.usada) {
    const inv = carga.tipo === 'lista' ? carga.inv : null
    const texto =
      carga.tipo === 'sin-senal'
        ? 'Sin señal. Para abrir la invitación hace falta conexión.'
        : carga.tipo === 'no-existe'
          ? 'Ese link no es de una invitación. Revisá que esté completo o pedí que te manden otro.'
          : inv?.usada
            ? 'Esta invitación ya se usó. Si sos vos, entrá con tu celular.'
            : `La invitación venció: duran 7 días. Pedile a ${inv?.invita} que te mande otra.`
    return (
      <AccesoLayout
        tituloCompu="Te esperan en el campo."
        tituloCelu={inv?.usada ? 'Ya estás adentro.' : 'La invitación no sirve.'}
      >
        <TarjetaWhatsApp tipo="error" pie={texto} />
        {carga.tipo === 'sin-senal' ? (
          <BotonPrincipal icono="Reintentar" onClick={() => window.location.reload()}>
            Probar de nuevo
          </BotonPrincipal>
        ) : (
          <BotonChico type="button" className="self-center" onClick={() => navigate('/login')}>
            Entrar con mi celular
          </BotonChico>
        )}
      </AccesoLayout>
    )
  }

  const inv = carga.inv
  const rol = ROLES[inv.rol]

  async function entrar() {
    setMandando(true)
    setFallo(null)
    const partes = inv.nombre.trim().split(/\s+/)
    // Crea la cuenta del invitado si no existe; si ya tiene, sólo le manda el código.
    const r = await pedirCodigo(inv.celular, {
      nombre: partes.slice(0, -1).join(' ') || inv.nombre,
      apellido: partes.length > 1 ? partes.at(-1)! : '',
      mail: '',
    })
    setMandando(false)
    if (r.ok || r.error.tipo === 'esperar') {
      marcarEnviado(inv.celular, {
        alta: false,
        invitacion: token,
        esperaSegundos: r.ok ? undefined : r.error.tipo === 'esperar' ? r.error.segundos : undefined,
      })
      navigate('/login/codigo')
      return
    }
    setFallo(
      r.error.tipo === 'sin-senal'
        ? 'Sin señal. Para entrar la primera vez hace falta conexión.'
        : 'No pudimos mandar el código. Probá de nuevo en un rato.',
    )
  }

  return (
    <AccesoLayout
      tituloCompu={`${inv.invita} te sumó a ${inv.empresa}.`}
      tituloCelu={`${inv.invita} te sumó a ${inv.empresa}.`}
      encabezado={{
        titulo: 'Te invitaron',
        bajada: `Te llega un código al ${formatearCelularAR(inv.celular)} para entrar.`,
      }}
    >
      <dl className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-2">
          <dt className="text-[14px] font-semibold text-texto">Entrás como</dt>
          <dd className="text-[18px] font-bold text-texto">
            {rol.etiqueta} · {inv.nombre}
          </dd>
        </div>
        <div className="flex flex-col gap-2">
          <dt className="text-[14px] font-semibold text-texto">Vas a poder</dt>
          <dd className="text-[18px] font-bold text-texto">{rol.puede}</dd>
        </div>
      </dl>
      {fallo && <TarjetaWhatsApp tipo="error" pie={fallo} />}
      <BotonPrincipal icono="Celular" cargando={mandando} disabled={mandando} onClick={() => void entrar()}>
        {mandando ? 'Mandando el código…' : 'Entrar con mi celular'}
      </BotonPrincipal>
      <p className="text-center text-[14.5px] text-texto-suave">
        La plata del campo no la ves: queda para {inv.invita}.
      </p>
    </AccesoLayout>
  )
}
