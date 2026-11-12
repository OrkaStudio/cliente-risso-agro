import { useEffect, useRef } from 'react'
import { Logo } from '@/components/tropero/logo'
// Foto aérea del Figma (nodo 217:40587): caminos de tierra, la aguada y la hacienda.
import fotoCampo from '@/assets/tropero/campo-aereo.webp'

// Marco de las pantallas de Acceso (página 35, sección Acceso).
// Compu (≥ md): foto a la izquierda (760 de 1440) con el título grande abajo y
// el formulario de 420 centrado a la derecha.
// Celular (QA 10/11, B1): la foto es una franja de 150 px con el logo; el título
// y la bajada van arriba del formulario, así el botón queda cerca y a la vista.

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
  const raiz = useRef<HTMLDivElement>(null)
  // Con el teclado abierto, el botón principal queda a la vista (QA 10/11, A2).
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const alEnfocar = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLInputElement) || window.innerWidth >= 768) return
      setTimeout(() => el.querySelector<HTMLElement>('button[type="submit"]')?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 320)
    }
    // Cuando el teclado cambia el alto visible, se vuelve a acomodar.
    const alCambiar = () => {
      const activo = document.activeElement
      if (activo instanceof HTMLInputElement && el.contains(activo) && window.innerWidth < 768) el.querySelector<HTMLElement>('button[type="submit"]')?.scrollIntoView({ block: 'end' })
    }
    el.addEventListener('focusin', alEnfocar)
    window.visualViewport?.addEventListener('resize', alCambiar)
    return () => {
      el.removeEventListener('focusin', alEnfocar)
      window.visualViewport?.removeEventListener('resize', alCambiar)
    }
  }, [])
  return (
    <div ref={raiz} className="flex h-full flex-col overflow-y-auto bg-fondo md:flex-row md:overflow-hidden">
      {/* Foto: una franja arriba en el celular, a la izquierda en la compu. Mientras carga, terracota oscuro (M5). */}
      <div className="relative flex h-[150px] shrink-0 flex-col overflow-hidden bg-terracota-800 md:h-full md:w-[52.8%] md:flex-none">
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[rgba(19,27,22,0.35)] to-[rgba(19,27,22,0.85)] md:bg-[linear-gradient(180deg,rgba(19,27,22,0.5)_0%,rgba(19,27,22,0)_30%,rgba(19,27,22,0.1)_60%,rgba(19,27,22,0.9)_100%)]"
        />
        <div className="relative px-6 pt-[max(24px,calc(env(safe-area-inset-top)+16px))] md:px-14 md:pt-[52px]">
          <Logo tono="hueso" alto={26} className="md:hidden" />
          <Logo tono="hueso" alto={34} className="hidden md:block" />
        </div>
        <p className="titulo-display relative mt-auto hidden w-full max-w-[724px] px-[52px] pb-[110px] text-[76px] leading-[0.96] tracking-[-0.04em] text-superficie md:block">
          {tituloCompu}
        </p>
      </div>

      {/* Formulario: hoja abajo en el celular, columna a la derecha en la compu */}
      <main className="relative z-10 -mt-6 rounded-t-[28px] bg-fondo px-[18px] pt-7 pb-[max(28px,env(safe-area-inset-bottom))] md:mt-0 md:flex md:flex-1 md:items-center md:justify-center md:overflow-y-auto md:rounded-none md:px-10 md:py-12">
        <div className="mx-auto flex w-full max-w-[420px] flex-col gap-[18px] md:gap-[22px]">
          {/* En el celular, el título y la bajada arriba del formulario (B1, M2). */}
          <div className="flex flex-col gap-1.5 md:hidden">
            <h1 className="titulo-display text-[30px] leading-[1.05] text-texto">{tituloCelu}</h1>
            {encabezado?.bajada && <p className="text-[15px] leading-[1.4] text-texto-suave">{encabezado.bajada}</p>}
          </div>
          {encabezado && (
            <div className="hidden flex-col gap-2.5 pb-1.5 md:flex">
              <h2 className="t-pagina text-texto">
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
  // Cada fila centrada y en una sola línea; la acción va como texto de color, sin caja (Lau 12/11: con
  // dos píldoras se veía desordenado).
  return (
    <div className="flex flex-col items-center border-t border-borde pt-3 text-[14.5px] text-texto-suave md:text-[15px] [&_button]:min-h-10 [&_button]:border-0 [&_button]:px-1 [&_button]:hover:bg-transparent [&_button]:hover:underline">
      {filas.map((f) => (
        <div key={f.texto} className="flex items-center justify-center gap-1 whitespace-nowrap">
          <span>{f.texto}</span>
          {f.boton}
        </div>
      ))}
    </div>
  )
}

/** Cómo llega el código (una línea) y las tarjetas de estado (sin cuenta, sin señal, error). */
export function TarjetaWhatsApp({
  tipo = 'asi-llega',
  pie,
  titulo,
}: {
  tipo?: 'asi-llega' | 'sin-cuenta' | 'sin-senal' | 'error'
  pie?: React.ReactNode
  /** El título del error, cuando no es «No salió el código» (A10). */
  titulo?: string
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
      error: { titulo: titulo ?? 'No salió el código', cuerpo: pie },
    }[tipo]
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-[18px] bg-estado-problema-suave px-[18px] py-4">
        <p className="text-[13px] font-bold text-estado-problema-texto">{textos.titulo}</p>
        <p className="text-[13px] text-estado-problema-texto">{textos.cuerpo}</p>
      </div>
    )
  }
  // Una sola línea, en celu y en compu (Lau 12/11: el ejemplo del mensaje era mucho texto).
  return <p className="text-[14px] text-texto-suave">Te llega un código por WhatsApp. Sin contraseñas.</p>
}

/** Dónde están los términos y la privacidad. [DEFINIR] los términos: todavía no hay página. */
const TERMINOS_URL: string | null = null
const PRIVACIDAD_URL = '/privacidad.html'

/** Términos y privacidad, en letra chica (QA 10/11, A6). En registro con «Al seguir aceptás…». */
export function Legales({ aceptas = false }: { aceptas?: boolean }) {
  const link = 'underline decoration-borde underline-offset-2 hover:text-principal'
  const terminos = TERMINOS_URL ? (
    <a href={TERMINOS_URL} target="_blank" rel="noreferrer" className={link}>
      Términos
    </a>
  ) : null
  const privacidad = (
    <a href={PRIVACIDAD_URL} target="_blank" rel="noreferrer" className={link}>
      Política de privacidad
    </a>
  )
  return (
    <p className="-mt-2 text-center text-[12px] leading-snug text-texto-suave">
      {aceptas ? 'Al seguir aceptás ' : ''}
      {terminos && (
        <>
          {aceptas ? 'los ' : ''}
          {terminos}
          {aceptas ? ' y la ' : ' · '}
        </>
      )}
      {!terminos && aceptas ? 'la ' : ''}
      {privacidad}
      {aceptas ? '.' : ''}
    </p>
  )
}
