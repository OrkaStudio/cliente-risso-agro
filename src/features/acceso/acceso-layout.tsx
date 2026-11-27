import { useContext, useEffect, useRef } from 'react'
import { ConTrazo, EscenaAcceso, FranjaMapa } from './escena-acceso'
import { Logo } from '@/components/tropero/logo'
import { DentroDelFondo } from './fondo-contexto'

// Marco de las pantallas de Acceso (página 35, sección Acceso).
// Compu (≥ md): foto a la izquierda (760 de 1440) con el título grande abajo y
// el formulario de 420 centrado a la derecha.
// Celular y compu, el mismo sistema (Lau 13/11): la foto del campo cubre toda la
// pantalla; arriba, el sello de la marca y la frase; el formulario, en una
// tarjeta crema sobre la foto (abajo en el celular, a la derecha en la compu).
// No hay corte entre foto y formulario que resolver.

const FOTOS = { campo: 'campo' } as const

export function AccesoLayout({
  foto = 'campo',
  tituloCompu,
  tituloCelu,
  encabezado,
  pie,
  children,
}: {
  foto?: keyof typeof FOTOS
  /** El título grande sobre la foto, en la compu. */
  tituloCompu: string
  /** El título sobre la foto, en el celular (cambia según el estado). */
  tituloCelu: string
  /** Título y bajada del formulario (sólo en la compu, como en la 35). */
  encabezado?: { titulo: string; bajada?: React.ReactNode }
  /** Lo que va debajo de la tarjeta, sobre la foto (los links legales del login). */
  pie?: React.ReactNode
  children: React.ReactNode
}) {
  void FOTOS[foto]
  const enFondo = useContext(DentroDelFondo)
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
    <div ref={raiz} className="sin-barra relative isolate flex h-full flex-col overflow-y-auto md:w-[54%] md:overflow-y-auto">
      {/* Fuera de <FondoAcceso> la pantalla pone su propia escena. */}
      {!enFondo && <EscenaAcceso />}
      {/* En la compu, la frase de cada pantalla va sobre el mapa, a la derecha (Lau, 26/11). */}
      <p className="titulo-display pointer-events-none fixed top-[52px] left-[calc(54%+40px)] z-0 hidden max-w-[min(440px,calc(46%-80px))] text-[clamp(28px,2.4vw,36px)] leading-[1.02] tracking-[-0.035em] text-superficie md:block">
        <ConTrazo texto={tituloCompu} claro />
      </p>
      {/* El formulario, directo sobre la aurora: sin tarjeta, como la landing. */}
      <main className="flex w-full flex-1 flex-col px-[22px] pt-3 pb-[max(20px,env(safe-area-inset-bottom))] md:px-[clamp(40px,6vw,96px)] md:pt-28 md:pb-10">
        <div className="mx-auto flex w-full max-w-[400px] flex-col gap-[16px] md:my-auto md:mx-0 bajo:gap-3">
          <FranjaMapa />
          {encabezado ? (
            <div className="flex flex-col gap-2">
              <h1 className="titulo-display text-[clamp(36px,9.5vw,52px)] leading-[1] tracking-[-0.035em] text-balance text-texto md:text-[clamp(32px,2.6vw,40px)]">
                <ConTrazo texto={encabezado.titulo} />
              </h1>
              {encabezado.bajada && <p className="mt-1.5 text-[16px] leading-[1.4] text-texto-suave md:text-[17px]">{encabezado.bajada}</p>}
            </div>
          ) : (
            <h1 className="titulo-display text-[clamp(36px,9.5vw,52px)] leading-[1] tracking-[-0.035em] text-texto">
              <ConTrazo texto={tituloCelu} />
            </h1>
          )}
          {children}
          {pie}
        </div>
      </main>
    </div>
  )
}

/** El fondo del acceso: la escena de la landing con el campo (ver escena-acceso). */
export function FotoDeFondo() {
  return <EscenaAcceso />
}

/** El logo en sus colores, sobre la aurora (26/11: sin pastilla, el fondo ya es claro). */
export function Sello() {
  return (
    <span className="inline-flex items-center">
      <Logo alto={24} className="md:hidden" />
      <Logo alto={26} className="hidden md:block" />
    </span>
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
  return <p className="text-[14px] text-texto-suave">Te llega un código por WhatsApp.</p>
}

/** Términos y privacidad en letra chica (QA 10/11, A6). En registro e invitación, con «Al seguir aceptás…». */
export function Legales({ aceptas = false, sobreFoto = false }: { aceptas?: boolean; sobreFoto?: boolean }) {
  // Sobre la foto sólo en el celular; en la compu el pie va adentro del panel, con los colores de siempre.
  // Desde el 26/11 el fondo es la aurora clara: los mismos colores en celu y compu.
  void sobreFoto
  const link = 'underline decoration-borde underline-offset-2 hover:text-principal'
  return (
    <p className="text-center text-[12px] leading-snug text-texto-suave">
      {aceptas && 'Al seguir aceptás los '}
      <a href="/terminos" target="_blank" rel="noreferrer" className={link}>
        Términos
      </a>
      {aceptas ? ' y la ' : ' · '}
      <a href="/privacidad" target="_blank" rel="noreferrer" className={link}>
        Política de privacidad
      </a>
      {aceptas && '.'}
    </p>
  )
}
