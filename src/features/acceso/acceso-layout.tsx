import { useContext, useEffect, useRef } from 'react'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
// Foto aérea del Figma (nodo 217:40587): caminos de tierra, la aguada y la hacienda.
import fotoCampo from '@/assets/tropero/campo-aereo.webp'
import { DentroDelFondo } from './fondo-contexto'

// Marco de las pantallas de Acceso (página 35, sección Acceso).
// Compu (≥ md): foto a la izquierda (760 de 1440) con el título grande abajo y
// el formulario de 420 centrado a la derecha.
// Celular y compu, el mismo sistema (Lau 13/11): la foto del campo cubre toda la
// pantalla; arriba, el sello de la marca y la frase; el formulario, en una
// tarjeta crema sobre la foto (abajo en el celular, a la derecha en la compu).
// No hay corte entre foto y formulario que resolver.

const FOTOS = { campo: fotoCampo } as const

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
  const src = FOTOS[foto]
  const enFondo = useContext(DentroDelFondo)
  // Si el título del celular es la misma frase de la foto, en la hoja va el del formulario.
  const tituloHoja = tituloCelu !== tituloCompu ? tituloCelu : encabezado?.titulo
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
    <div ref={raiz} className={cn('relative isolate flex h-full flex-col overflow-y-auto md:flex-row md:overflow-hidden', !enFondo && 'bg-terracota-800')}>
      {/* Fuera de <FondoAcceso> (cambiar el número, ya adentro) la pantalla pone su propia foto. */}
      {!enFondo && <FotoDeFondo src={src} />}

      {/* Arriba el sello de la marca, solo. La frase va lejos de él (Lau 13/11: pegados competían):
          en el celular, justo sobre la tarjeta; en la compu, abajo a la izquierda. */}
      <div className="flex shrink-0 flex-col items-start px-6 pt-[max(24px,calc(env(safe-area-inset-top)+16px))] md:flex-1 md:justify-between md:px-14 md:pt-12 md:pb-16">
        {/* Dentro del fondo el sello real es el de <FondoAcceso>, que no se mueve al navegar: acá sólo guarda su lugar. */}
        {enFondo ? <span aria-hidden className="invisible"><Sello /></span> : <Sello />}
        <h1 className="titulo-display hidden max-w-[640px] text-[clamp(56px,5.4vw,76px)] leading-[0.96] tracking-[-0.04em] text-superficie md:block">{tituloCompu}</h1>
      </div>

      {/* El formulario: una tarjeta sobre la foto; abajo en el celular, un panel a la derecha en la compu. */}
      <div className="mt-auto flex w-full flex-col px-3 pt-16 pb-[max(12px,env(safe-area-inset-bottom))] md:mt-0 md:w-[min(560px,46%)] md:flex-none md:justify-center md:py-6 md:pr-6 md:pl-0">
        <h1 className="titulo-display mx-auto mb-5 w-full max-w-[444px] px-3 text-[clamp(32px,9.5vw,44px)] leading-[0.98] tracking-[-0.03em] text-superficie md:hidden">{tituloCompu}</h1>
        {/* La tarjeta tiene el alto de lo que lleva: nunca vacía ni apretada. */}
        <main className="relative mx-auto w-full max-w-[444px] rounded-[28px] bg-fondo px-5 pt-6 pb-5 shadow-[0_20px_50px_rgba(19,27,22,0.35)] md:flex md:max-h-full md:max-w-none md:flex-col md:overflow-y-auto md:rounded-[32px] md:px-10 md:py-11">
          <div className="mx-auto flex w-full max-w-[420px] flex-col gap-[18px] md:my-auto md:gap-[22px]">
            {/* En el celular, el título y la bajada arriba del formulario (B1, M2). */}
            {(tituloHoja || encabezado?.bajada) && (
              <div className="flex flex-col gap-1 md:hidden">
                {tituloHoja && <h2 className="t-seccion text-texto">{tituloHoja}</h2>}
                {encabezado?.bajada && <p className="text-[15px] leading-[1.4] text-texto-suave">{encabezado.bajada}</p>}
              </div>
            )}
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
          {pie && <div className="hidden md:block">{pie}</div>}
          </div>
        </main>
        {pie && <div className="mx-auto mt-3 w-full max-w-[444px] md:hidden">{pie}</div>}
      </div>
    </div>
  )
}

/** La foto del campo a pantalla completa, quieta detrás. Mientras carga, terracota oscuro (M5). */
export function FotoDeFondo({ src = fotoCampo }: { src?: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src={src} alt="" className="foto-llega absolute -top-[20%] h-[120%] w-full object-cover md:top-0 md:left-[-20%] md:h-full md:w-[120%] md:max-w-none" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,27,22,0.3)_0%,rgba(19,27,22,0.05)_28%,rgba(19,27,22,0.5)_62%,rgba(19,27,22,0.72)_100%)] md:bg-[radial-gradient(ellipse_75%_60%_at_0%_100%,rgba(19,27,22,0.9),transparent)]" />
    </div>
  )
}

/** El logo en sus colores, sobre una pastilla crema: se distingue del título blanco sin agrandarse. */
export function Sello() {
  return (
    <span className="inline-flex items-center rounded-full bg-fondo px-4 py-2.5 shadow-[0_6px_20px_rgba(19,27,22,0.25)] md:px-5 md:py-3">
      <Logo alto={22} className="md:hidden" />
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
  const link = sobreFoto
    ? 'underline decoration-superficie/40 underline-offset-2 hover:text-superficie md:decoration-borde md:hover:text-principal'
    : 'underline decoration-borde underline-offset-2 hover:text-principal'
  return (
    <p className={cn('text-center text-[12px] leading-snug', sobreFoto ? 'text-superficie/80 md:text-texto-suave' : '-mt-2 text-texto-suave')}>
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
