import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
// Foto aérea del Figma (nodo 217:40587): caminos de tierra, la aguada y la hacienda.
import fotoCampo from '@/assets/tropero/campo-aereo.webp'

// Marco de las pantallas de Acceso (página 35, sección Acceso).
// Compu (≥ md): foto a la izquierda (760 de 1440) con el título grande abajo y
// el formulario de 420 centrado a la derecha.
// Celular: foto arriba con el título, y la hoja redondeada abajo con el
// formulario, que se superpone 32 px a la foto.

const FOTOS = { campo: fotoCampo } as const

export function AccesoLayout({
  foto = 'campo',
  tituloCompu,
  tituloCelu,
  encabezado,
  children,
}: {
  foto?: keyof typeof FOTOS
  /** El título grande sobre la foto, en la compu. */
  tituloCompu: string
  /** El título sobre la foto, en el celular (cambia según el estado). */
  tituloCelu: string
  /** Título y bajada del formulario (sólo en la compu, como en la 35). */
  encabezado?: { titulo: string; bajada?: React.ReactNode }
  children: React.ReactNode
}) {
  const src = FOTOS[foto]
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-fondo md:flex-row md:overflow-hidden">
      {/* Foto: arriba en el celular, a la izquierda en la compu */}
      <div className="relative flex min-h-[260px] flex-1 flex-col overflow-hidden md:h-full md:w-[52.8%] md:flex-none">
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[rgba(19,27,22,0.35)] to-[rgba(19,27,22,0.85)] md:bg-[linear-gradient(180deg,rgba(19,27,22,0.5)_0%,rgba(19,27,22,0)_30%,rgba(19,27,22,0.1)_60%,rgba(19,27,22,0.9)_100%)]"
        />
        <div className="relative px-6 pt-[max(24px,calc(env(safe-area-inset-top)+16px))] md:px-14 md:pt-[52px]">
          <Logo tono="hueso" alto={26} className="md:hidden" />
          <Logo tono="hueso" alto={34} className="hidden md:block" />
        </div>
        <h1 className="titulo-display relative mt-auto px-[22px] pb-[52px] text-[40px] text-superficie md:hidden">
          {tituloCelu}
        </h1>
        <p className="titulo-display relative mt-auto hidden w-full max-w-[724px] px-[52px] pb-[110px] text-[76px] leading-[0.96] tracking-[-0.04em] text-superficie md:block">
          {tituloCompu}
        </p>
      </div>

      {/* Formulario: hoja abajo en el celular, columna a la derecha en la compu */}
      <main className="relative z-10 -mt-8 rounded-t-[32px] bg-fondo px-[18px] pt-7 pb-[max(28px,env(safe-area-inset-bottom))] md:mt-0 md:flex md:flex-1 md:items-center md:justify-center md:overflow-y-auto md:rounded-none md:px-10 md:py-12">
        <div className="mx-auto flex w-full max-w-[420px] flex-col gap-[18px] md:gap-[22px]">
          {encabezado && (
            <div className="hidden flex-col gap-2.5 pb-1.5 md:flex">
              <h2 className="titulo-display text-[44px] leading-none tracking-[-0.02em] text-texto">
                {encabezado.titulo}
              </h2>
              {encabezado.bajada && (
                <p className="text-[16.5px] leading-[1.4] text-texto-suave">{encabezado.bajada}</p>
              )}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}

/**
 * Las preguntas al pie («¿Primera vez? [Creá tu cuenta]»), una o varias,
 * alineadas sobre el mismo eje: las preguntas terminan
 * en el centro y los botones arrancan ahí, así forman dos columnas prolijas en
 * vez de filas centradas cada una por su lado.
 */
export function Preguntas({ filas }: { filas: { texto: string; boton: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 items-center gap-x-2 gap-y-2.5 border-t border-borde pt-[18px] text-[14.5px] text-texto-suave md:text-[15px]">
      {filas.map((f) => (
        <div key={f.texto} className="contents">
          <span className="justify-self-end text-right">{f.texto}</span>
          <span className="justify-self-start">{f.boton}</span>
        </div>
      ))}
    </div>
  )
}

/** La tarjeta «Así te llega, por WhatsApp» con el mensaje real, y sus variantes
 *  de estado (sin cuenta, sin señal). */
export function TarjetaWhatsApp({
  tipo = 'asi-llega',
  pie,
}: {
  tipo?: 'asi-llega' | 'sin-cuenta' | 'sin-senal' | 'error'
  pie?: React.ReactNode
}) {
  if (tipo !== 'asi-llega') {
    const textos = {
      'sin-cuenta': {
        titulo: 'Ese número no tiene cuenta',
        cuerpo:
          'Si es tu primera vez, creá la cuenta. Si te invitaron, pedile a quien te invitó que revise el número en Personas.',
      },
      'sin-senal': {
        titulo: 'Sin señal',
        cuerpo:
          'Para entrar la primera vez en este celular hace falta señal. Si ya entraste antes, la app abre igual con lo último que tenías.',
      },
      error: { titulo: 'No salió el código', cuerpo: pie },
    }[tipo]
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-[18px] bg-estado-problema-suave px-[18px] py-4">
        <p className="text-[13px] font-bold text-estado-problema-texto">{textos.titulo}</p>
        <p className="text-[13px] text-estado-problema-texto">{textos.cuerpo}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] border border-borde bg-superficie px-[18px] py-4">
      <p className="text-[13px] font-bold text-texto-suave">Así te llega, por WhatsApp</p>
      <div aria-hidden className="flex flex-col gap-1 rounded-[14px] bg-estado-bien-suave px-3.5 py-2.5">
        <p className="text-[13px] font-bold text-estado-bien-texto">Tropero</p>
        <p className="text-[14px] text-estado-bien-texto">
          Tu código de verificación es 482913. Por tu seguridad, no lo compartas. Este código caduca en 10 minutos.
        </p>
        <span className="flex items-center justify-center gap-1.5 rounded-[10px] bg-white/70 px-3 py-[7px] text-[13px] font-bold text-estado-bien-texto">
          <Icono nombre="Comprobante" tamano={16} />
          Copiar código
        </span>
      </div>
      {pie && <p className="text-[13px] text-texto-suave">{pie}</p>}
    </div>
  )
}
