// Página interna de desarrollo (/estilo/animaciones): cada momento de un botón
// —tocar, cargando, listo, sin señal, falló, apagado, pasos y paneles—, cómo
// funciona hoy con los componentes reales y, al lado, las opciones nuevas para
// elegir entre Fran y Lau. No existe en producción.
//
// Para sumar una opción: agregarla en OPCIONES, en el momento que corresponda.
// Los lugares que quedan libres se muestran vacíos para que se vea qué falta.
import { MotionConfig } from "framer-motion"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { esperar, MONTO, Velocidad } from "./animaciones-base"
import {
  BotonConCuerpo,
  BotonConMarca,
  BotonCuerpoMarca,
  BotonDesliza,
  BotonSobrio,
  DemoApagado,
  DemoCargando,
  DemoFallo,
  DemoListo,
  DemoPanel,
  DemoPasos,
  DemoTelefono,
  DemoTocar,
} from "./animaciones-opciones"
import { Boton, BotonChico, BotonPrincipal } from "./boton"
import { Icono } from "./icono"
import { Logo } from "./logo"
import { BotonVolver, Grupo, Opciones, PanelLateral } from "./panel-lateral"
import { Segmentos } from "./segmentos"

type Momento = {
  id: string
  titulo: string
  /** Lo que el botón le tiene que contestar a la persona. */
  pregunta: string
  /** Cómo funciona hoy, leído del código. */
  hoy: string
  /** Dónde está hoy en el código, para ir a cambiarlo. */
  donde: string
  Hoy: () => React.ReactElement
}

type Opcion = {
  /** La letra de la personalidad, fija en todas las filas: A Sobria, B Con cuerpo, C Con la marca, D Se desliza. */
  letra: "A" | "B" | "C" | "D" | "E"
  nombre: string
  /** La idea en una frase: qué cambia respecto de hoy. */
  idea: string
  Demo: () => React.ReactElement
}

/** Cuántos lugares vacíos se muestran en un momento que todavía no tiene ninguna opción. */
const LUGARES = 3

// ===== Las opciones nuevas, por momento =====
// Las personalidades están en animaciones-opciones.tsx. En todas, el cargando aparece
// sólo si tarda más de 0,3 s y, si aparece, queda al menos 0,4 s (animaciones-base.ts).
// Fran eligió B y C el 18/11: la A queda sólo en Cargando y Listo, de referencia.
const B = { letra: "B", nombre: "Con cuerpo" } as const
const C = { letra: "C", nombre: "Con la marca" } as const
// D: el botón con ícono de shadcnspace, que cruza el círculo al pasar el mouse; acá cruza al apretar.
const D = { letra: "D", nombre: "Se desliza" } as const
// E: propuesta de Lau (18/11), lo que se siente de la B con lo que se ve de la C.
const E = { letra: "E", nombre: "Cuerpo y marca" } as const

const OPCIONES: Record<string, Opcion[]> = {
  tocar: [
    { ...B, idea: "Todos los botones se hunden al apretar y rebotan al soltar. Se siente con el pulgar, sin mirar.", Demo: () => <DemoTocar p="cuerpo" /> },
    {
      ...C,
      idea: "La píldora no se mueve: el círculo trigo, o el ícono en los botones chicos, empuja hacia adelante, como arrancando.",
      Demo: () => <DemoTocar p="marca" />,
    },
    { ...D, idea: "Al apretar, el círculo cruza la píldora hacia la izquierda y el texto se corre; al soltar vuelve. Los botones chicos empujan el ícono.", Demo: () => <DemoTocar p="desliza" /> },
    { ...E, idea: "Todo el botón se hunde y rebota como la B, y a la vez el círculo trigo (o el ícono) empuja hacia adelante como la C.", Demo: () => <DemoTocar p="cuerpoMarca" /> },
  ],
  cargando: [
    {
      letra: "A",
      nombre: "Sobria",
      idea: "El círculo que gira sale sólo si tarda más de 0,3 s, así no parpadea. El texto pasa a «Anotando…».",
      Demo: () => <DemoCargando Boton={BotonSobrio} textoCargando="Anotando…" />,
    },
    { ...B, idea: "La píldora se encoge con un resorte hasta quedar sólo el círculo girando.", Demo: () => <DemoCargando Boton={BotonConCuerpo} /> },
    {
      ...C,
      idea: "El trigo va llenando el botón de izquierda a derecha y el texto se invierte a tinta donde pasa.",
      Demo: () => <DemoCargando Boton={BotonConMarca} />,
    },
    { ...D, idea: "El círculo cruza apenas lo apretás, sin esperar los 0,3 s, y del otro lado gira mientras espera. Al terminar vuelve a su lugar.", Demo: () => <DemoCargando Boton={BotonDesliza} /> },
    { ...E, idea: "Como la C: el trigo va llenando el botón. No se encoge, para que se vea cuánto avanzó.", Demo: () => <DemoCargando Boton={BotonCuerpoMarca} /> },
  ],
  listo: [
    {
      letra: "A",
      nombre: "Sobria",
      idea: "El círculo trigo se funde a un tilde verde durante 1,4 s y vuelve. El texto no cambia.",
      Demo: () => <DemoListo Boton={BotonSobrio} textoCargando="Anotando…" />,
    },
    { ...B, idea: "Después de cargar, el botón se vuelve a abrir diciendo «Listo» y el tilde salta en el círculo.", Demo: () => <DemoListo Boton={BotonConCuerpo} /> },
    { ...C, idea: "El trigo termina de cubrir el botón y «Listo» cae estampado, como el sello de la caravana.", Demo: () => <DemoListo Boton={BotonConMarca} /> },
    { ...D, idea: "Cruza, espera girando y del otro lado se vuelve un tilde verde mientras dice «Listo». Después vuelve a su lugar.", Demo: () => <DemoListo Boton={BotonDesliza} /> },
    { ...E, idea: "El trigo cubre el botón, cae el sello «Listo» y la píldora acusa el golpe: se hunde y rebota, como cuando pega un sello de verdad.", Demo: () => <DemoListo Boton={BotonCuerpoMarca} /> },
  ],
  telefono: [
    {
      ...B,
      idea: "El botón dice «En el teléfono» y el círculo pasa a ámbar con el ícono de sin señal latiendo. La línea de lo que falta subir entra con un resorte.",
      Demo: () => <DemoTelefono p="cuerpo" />,
    },
    {
      ...C,
      idea: "El trigo cubre el botón con el sello «En el teléfono», punteado porque todavía falta subir. La línea de lo que falta subir se desliza como el trigo.",
      Demo: () => <DemoTelefono p="marca" />,
    },
    { ...D, idea: "Cruza y del otro lado queda ámbar con el ícono de sin señal, mientras dice «En el teléfono».", Demo: () => <DemoTelefono p="desliza" /> },
    { ...E, idea: "Sello punteado «En el teléfono» con el golpe, y el ícono de sin señal latiendo como en la B. Lo que falta subir entra con resorte.", Demo: () => <DemoTelefono p="cuerpoMarca" /> },
  ],
  fallo: [
    {
      ...B,
      idea: "El botón dice que no con una sacudida y el círculo se pone rojo; el motivo entra arriba con un resorte. Si no se pudo guardar, lo dice el mismo botón, sin aviso abajo.",
      Demo: () => <DemoFallo p="cuerpo" />,
    },
    {
      ...C,
      idea: "El círculo se pone rojo y la píldora tiembla corto; el motivo se desliza como el trigo. Si no se pudo guardar, el trigo se retira y el botón lo dice.",
      Demo: () => <DemoFallo p="marca" />,
    },
    { ...D, idea: "El círculo cruza, se pone rojo y se queda del otro lado diciendo «Falló. Tocá de nuevo» hasta el próximo toque.", Demo: () => <DemoFallo p="desliza" /> },
    { ...E, idea: "El «no» es la sacudida grande de la B y el círculo se pone rojo; si no se pudo guardar, el trigo se retira como en la C.", Demo: () => <DemoFallo p="cuerpoMarca" /> },
  ],
  apagado: [
    { ...B, idea: "Se ve al 60 %, pero se puede tocar: dice que no con una sacudida y explica qué falta.", Demo: () => <DemoApagado p="cuerpo" /> },
    { ...C, idea: "Se ve al 60 %; al tocarlo tiembla corto y aparece qué falta, deslizándose.", Demo: () => <DemoApagado p="marca" /> },
    { ...D, idea: "Apagado, el círculo no cruza: el botón tiembla corto y aparece qué falta.", Demo: () => <DemoApagado p="desliza" /> },
    { ...E, idea: "Se ve al 60 %; al tocarlo dice que no con la sacudida de la B y aparece qué falta con resorte.", Demo: () => <DemoApagado p="cuerpoMarca" /> },
  ],
  pasos: [
    {
      ...B,
      idea: "El paso sale hacia un costado y el nuevo entra por el otro con un resorte; Volver lo invierte. La barra se llena con el mismo resorte.",
      Demo: () => <DemoPasos p="cuerpo" />,
    },
    {
      ...C,
      idea: "El paso se desliza sin rebote. En la barra, el paso que estás llenando es trigo y los terminados quedan terracota. «Anotar» termina con el sello.",
      Demo: () => <DemoPasos p="marca" />,
    },
    { ...D, idea: "Al apretar Seguir el círculo cruza y el paso nuevo se desliza sin rebote. «Anotar» cruza, espera y termina en tilde.", Demo: () => <DemoPasos p="desliza" /> },
    { ...E, idea: "El paso entra con el resorte de la B; en la barra, el paso que estás llenando es trigo como en la C. «Anotar» termina con el sello y el golpe.", Demo: () => <DemoPasos p="cuerpoMarca" /> },
  ],
  panel: [
    { ...B, idea: "El panel entra con un resorte suave. Al anotar, el botón dice «Listo» y el panel se cierra solo.", Demo: () => <DemoPanel p="cuerpo" /> },
    { ...C, idea: "El panel entra con la curva de la casa, sin rebote. Al anotar cae el sello «Listo» y el panel se cierra solo.", Demo: () => <DemoPanel p="marca" /> },
    { ...D, idea: "El panel entra deslizándose sin rebote. Al anotar, el círculo cruza, se vuelve tilde y el panel se cierra solo.", Demo: () => <DemoPanel p="desliza" /> },
    { ...E, idea: "El panel entra con el resorte suave de la B. Al anotar cae el sello «Listo» con el golpe y el panel se cierra solo.", Demo: () => <DemoPanel p="cuerpoMarca" /> },
  ],
}

/** Un trabajo que tarda (guardar, mandar): mientras corre, el botón está ocupado. */
function useTarea() {
  const [ocupado, setOcupado] = useState(false)
  async function correr(ms: number, fin?: () => void) {
    if (ocupado) return
    setOcupado(true)
    await esperar(ms)
    setOcupado(false)
    fin?.()
  }
  return [ocupado, correr] as const
}

// ===== Hoy: los componentes reales, con el comportamiento que tienen en la app =====

function HoyTocar() {
  return (
    <div className="flex flex-col gap-3">
      <BotonPrincipal icono="Siguiente">Seguir</BotonPrincipal>
      <div className="flex flex-wrap items-center gap-2">
        <Boton icono="Guardar">Guardar</Boton>
        <Boton tipo="secundario">Cancelar</Boton>
        <BotonChico icono="Agregar">Agregar</BotonChico>
      </div>
    </div>
  )
}

function HoyCargando() {
  const [lento, correrLento] = useTarea()
  const [rapido, correrRapido] = useTarea()
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-texto-suave">Tarda 2 segundos</p>
      <BotonPrincipal icono="Guardar" cargando={lento} disabled={lento} onClick={() => void correrLento(2000)}>
        Anotar {MONTO}
      </BotonPrincipal>
      <p className="mt-2 text-[13px] font-semibold text-texto-suave">Tarda 0,2 segundos</p>
      <BotonPrincipal icono="Guardar" cargando={rapido} disabled={rapido} onClick={() => void correrRapido(200)}>
        Anotar {MONTO}
      </BotonPrincipal>
    </div>
  )
}

function HoyListo() {
  const [ocupado, correr] = useTarea()
  return (
    <BotonPrincipal
      icono="Guardar"
      cargando={ocupado}
      disabled={ocupado}
      onClick={() => void correr(1200, () => toast.success(`Listo: salieron ${MONTO}`, { description: "Lo ves en los movimientos." }))}
    >
      Anotar {MONTO}
    </BotonPrincipal>
  )
}

function HoyTelefono() {
  const [sinSubir, setSinSubir] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const sinSenal = sinSubir > 0 && !subiendo
  async function volvioLaSenal() {
    setSubiendo(true)
    await esperar(1500)
    setSubiendo(false)
    setSinSubir(0)
  }
  return (
    <div className="flex flex-col gap-3">
      <BotonPrincipal icono="Guardar" disabled={subiendo} onClick={() => setSinSubir((n) => n + 1)}>
        Anotar sin señal
      </BotonPrincipal>
      {/* El aviso del Modo Campo (Pendientes, en features/campo/inicio-page.tsx). */}
      {sinSenal && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
          <Icono nombre="Sin señal" tamano={16} /> Sin señal: trabajás igual y se sube solo cuando vuelva.
        </p>
      )}
      {sinSubir > 0 && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-superficie px-4 py-3 text-[14px] text-texto-suave">
          <span className={cn("inline-flex", subiendo && "animate-spin")}>
            <Icono nombre="Reintentar" tamano={16} />
          </span>
          <span>
            <b className="text-texto">{sinSubir === 1 ? "1 observación" : `${sinSubir} observaciones`}</b> sin subir: se sube sola.
          </span>
        </p>
      )}
      {sinSubir > 0 && !subiendo && (
        <BotonChico icono="Reintentar" onClick={() => void volvioLaSenal()} className="self-start">
          Volvió la señal
        </BotonChico>
      )}
    </div>
  )
}

function HoyFallo() {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, correr] = useTarea()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-semibold text-texto-suave">Falta un dato</p>
      {/* El aviso de error de los paneles (errorAviso en anotar-plata.tsx). */}
      {error && (
        <p role="alert" className="rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">
          {error}
        </p>
      )}
      <BotonPrincipal icono="Siguiente" onClick={() => setError("Escribí cuánto fue.")}>
        Seguir
      </BotonPrincipal>
      {error && (
        <BotonChico onClick={() => setError(null)} className="self-start">
          Empezar de nuevo
        </BotonChico>
      )}
      <p className="mt-2 text-[13px] font-semibold text-texto-suave">No se pudo guardar</p>
      <BotonPrincipal
        icono="Guardar"
        cargando={ocupado}
        disabled={ocupado}
        onClick={() => void correr(1200, () => toast.error("No se pudo guardar. Probá de nuevo."))}
      >
        Anotar {MONTO}
      </BotonPrincipal>
    </div>
  )
}

function HoyApagado() {
  return (
    <div className="flex flex-col gap-3">
      <BotonPrincipal icono="Siguiente">Prendido</BotonPrincipal>
      <BotonPrincipal icono="Siguiente" disabled>
        Apagado
      </BotonPrincipal>
      <BotonPrincipal icono="Guardar" cargando disabled>
        Cargando
      </BotonPrincipal>
    </div>
  )
}

const PASOS = ["Cuánto y en qué", "De dónde y cuándo", "El detalle, si querés"] as const

/** Una réplica chica de «Anotar plata» (anotar-plata.tsx): los pasos cambian de golpe. */
function HoyPasos() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [ocupado, correr] = useTarea()
  const [de, setDe] = useState<string[]>(["caja"])
  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-borde bg-fondo p-5">
      <div>
        {paso > 1 && (
          <BotonVolver onClick={() => setPaso((p) => (p - 1) as 1 | 2)} className="mb-3">
            Volver
          </BotonVolver>
        )}
        <p className="font-heading text-[22px] leading-[1.05] font-extrabold tracking-[-0.02em] text-texto">Anotar plata</p>
        <span className="mt-1.5 flex flex-col gap-2 text-[14px] text-texto-suave">
          <span className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn("h-1.5 w-8 rounded-full", n <= paso ? "bg-principal" : "bg-borde")} />
            ))}
          </span>
          <span>
            Paso {paso} de 3: {PASOS[paso - 1]}
          </span>
        </span>
      </div>
      <div className="min-h-[88px]">
        {paso === 1 && <p className="titulo-display cifra text-[40px] leading-tight text-estado-problema-texto">−{MONTO}</p>}
        {paso === 2 && (
          <Grupo titulo="De dónde salió">
            <Opciones
              etiqueta="De dónde salió"
              opciones={[
                { valor: "caja", texto: "Caja" },
                { valor: "banco", texto: "Banco" },
              ]}
              elegidas={de}
              onTocar={(v) => setDe([v])}
            />
          </Grupo>
        )}
        {paso === 3 && <p className="text-[15px] text-texto-suave">Una nota, la foto del comprobante o el IVA.</p>}
      </div>
      {paso < 3 ? (
        <BotonPrincipal icono="Siguiente" onClick={() => setPaso((p) => (p + 1) as 2 | 3)}>
          Seguir
        </BotonPrincipal>
      ) : (
        <BotonPrincipal
          icono="Guardar"
          cargando={ocupado}
          disabled={ocupado}
          onClick={() =>
            void correr(1200, () => {
              toast.success(`Listo: salieron ${MONTO}`, { description: "Lo ves en los movimientos." })
              setPaso(1)
            })
          }
        >
          Anotar {MONTO}
        </BotonPrincipal>
      )}
    </div>
  )
}

function HoyPanel() {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, correr] = useTarea()
  return (
    <>
      <BotonPrincipal icono="Agregar" onClick={() => setAbierto(true)}>
        Anotar plata
      </BotonPrincipal>
      <PanelLateral
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        chico
        titulo="Anotar plata"
        bajada="El panel real de la app, con su entrada y su salida."
        pie={
          <BotonPrincipal
            icono="Guardar"
            cargando={ocupado}
            disabled={ocupado}
            onClick={() =>
              void correr(1200, () => {
                setAbierto(false)
                toast.success(`Listo: salieron ${MONTO}`, { description: "Lo ves en los movimientos." })
              })
            }
          >
            Anotar {MONTO}
          </BotonPrincipal>
        }
      >
        <p className="titulo-display cifra text-[44px] leading-tight text-estado-problema-texto">−{MONTO}</p>
      </PanelLateral>
    </>
  )
}

const MOMENTOS: Momento[] = [
  {
    id: "tocar",
    titulo: "Tocar",
    pregunta: "¿Me tomó?",
    hoy: "Cambia de color y baja 1 px mientras lo apretás (150 ms). En el celular no hay «pasar el mouse»: queda sólo el 1 px.",
    donde: "components/tropero/boton.tsx · BASE",
    Hoy: HoyTocar,
  },
  {
    id: "cargando",
    titulo: "Cargando",
    pregunta: "¿Está haciendo?",
    hoy: "El ícono se cambia por un círculo que gira dentro del círculo trigo y el botón deja de responder. Si la respuesta llega rápido, el círculo parpadea.",
    donde: "BotonPrincipal · cargando",
    Hoy: HoyCargando,
  },
  {
    id: "listo",
    titulo: "Listo",
    pregunta: "¿Salió?",
    hoy: "El botón vuelve a quedar como antes y abajo al centro aparece la tarjeta tinta «Listo: …». La mirada está en el botón; la confirmación, en el borde.",
    donde: "toast.success · components/ui/sonner.tsx",
    Hoy: HoyListo,
  },
  {
    id: "telefono",
    titulo: "Quedó en el teléfono",
    pregunta: "¿Se guardó aunque no haya señal?",
    hoy: "El botón no dice nada distinto. En el Inicio del Modo Campo aparecen el aviso «Sin señal» y cuántas cargas faltan subir.",
    donde: "features/campo/inicio-page.tsx · Pendientes",
    Hoy: HoyTelefono,
  },
  {
    id: "fallo",
    titulo: "Falló",
    pregunta: "¿Qué pasó y qué hago?",
    hoy: "Si falta un dato, aparece de golpe una caja roja arriba del botón. Si no se pudo guardar, sale la tarjeta tinta de error abajo al centro.",
    donde: "errorAviso (anotar-plata.tsx) · toast.error",
    Hoy: HoyFallo,
  },
  {
    id: "apagado",
    titulo: "Apagado",
    pregunta: "¿Por qué no lo puedo tocar?",
    hoy: "Apagado queda al 60 % de opacidad. Mientras carga también se apaga, pero se ve entero.",
    donde: "BotonPrincipal · disabled",
    Hoy: HoyApagado,
  },
  {
    id: "pasos",
    titulo: "Siguiente y Volver",
    pregunta: "¿Para dónde voy y cuánto falta?",
    hoy: "El contenido del paso cambia de golpe y la barra salta al segmento siguiente. «Volver» aparece arriba del título desde el paso 2.",
    donde: "features/analitica/tropero/anotar-plata.tsx",
    Hoy: HoyPasos,
  },
  {
    id: "panel",
    titulo: "Abrir y cerrar un panel",
    pregunta: "¿Dónde estoy y cómo vuelvo?",
    hoy: "El panel entra por la derecha en 300 ms (curva de salida rápida) y el fondo se oscurece a la vez. Al guardar se cierra y sale el «Listo».",
    donde: "components/tropero/panel-lateral.tsx",
    Hoy: HoyPanel,
  },
]

/** Cámara lenta para lo que se anima con CSS (los botones de hoy, el panel, el aviso):
 *  va a un cuarto de velocidad. Las opciones con framer-motion se frenan aparte,
 *  multiplicando sus duraciones por Velocidad; por eso acá se tocan sólo las de CSS. */
function useCamaraLenta(lenta: boolean) {
  useEffect(() => {
    if (!lenta) return
    const deCss = (a: Animation) => a instanceof CSSTransition || a instanceof CSSAnimation
    let id = 0
    const cuadro = () => {
      for (const a of document.getAnimations()) if (deCss(a) && a.playbackRate !== 0.25) a.playbackRate = 0.25
      id = requestAnimationFrame(cuadro)
    }
    id = requestAnimationFrame(cuadro)
    return () => {
      cancelAnimationFrame(id)
      for (const a of document.getAnimations()) if (deCss(a)) a.playbackRate = 1
    }
  }, [lenta])
}

function Tarjeta({ etiqueta, children, nota, donde, hoy = false }: { etiqueta: string; children: React.ReactNode; nota: string; donde?: string; hoy?: boolean }) {
  return (
    <article className="flex w-[min(320px,calc(100vw-32px))] shrink-0 snap-start flex-col gap-4 rounded-[22px] bg-superficie p-5">
      <p className={cn("self-start rounded-full px-3 py-1 text-[13px] font-bold", hoy ? "bg-tinta text-superficie" : "bg-acento text-acento-texto")}>{etiqueta}</p>
      <div className="flex-1">{children}</div>
      <div className="border-t border-borde pt-3">
        <p className="text-[14px] leading-snug text-texto">{nota}</p>
        {donde && <p className="mt-1.5 font-mono text-[12px] text-texto-suave">{donde}</p>}
      </div>
    </article>
  )
}

function Lugar({ letra }: { letra: string }) {
  return (
    <article className="flex min-h-[260px] w-[min(320px,calc(100vw-32px))] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-borde p-5 text-center">
      <p className="text-[15px] font-bold text-texto-suave">Opción {letra}</p>
      <p className="text-[13.5px] text-texto-suave">Lugar libre para una versión nueva</p>
    </article>
  )
}

function Fila({ m, numero }: { m: Momento; numero: number }) {
  const opciones = OPCIONES[m.id] ?? []
  const libres = opciones.length ? 0 : LUGARES
  const letra = (i: number) => String.fromCharCode(65 + i)
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-texto-suave">
          {numero} · {m.pregunta}
        </p>
        <h2 className="t-seccion">{m.titulo}</h2>
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">
        <Tarjeta etiqueta="Hoy" nota={m.hoy} donde={m.donde} hoy>
          <m.Hoy />
        </Tarjeta>
        {opciones.map((o) => (
          <Tarjeta key={o.letra} etiqueta={`Opción ${o.letra} · ${o.nombre}`} nota={o.idea}>
            <o.Demo />
          </Tarjeta>
        ))}
        {Array.from({ length: libres }, (_, i) => (
          <Lugar key={i} letra={letra(i)} />
        ))}
      </div>
    </section>
  )
}

export function AnimacionesMuestra() {
  const [noche, setNoche] = useState(false)
  const [velocidad, setVelocidad] = useState<"normal" | "lenta">("normal")
  useCamaraLenta(velocidad === "lenta")
  return (
    <Velocidad.Provider value={velocidad === "lenta" ? 4 : 1}>
    <MotionConfig reducedMotion="user">
    <div className={noche ? "dark h-full" : "h-full"}>
      <div className="h-full overflow-y-auto bg-fondo text-texto">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-12 px-4 py-8 sm:px-10">
          <header className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <Logo alto={28} />
              <BotonChico onClick={() => setNoche((n) => !n)}>{noche ? "Día" : "Noche"}</BotonChico>
            </div>
            <div className="max-w-2xl">
              <h1 className="t-pagina">Animaciones de los botones</h1>
              <p className="mt-2 text-[16px] text-texto-suave">
                Cada fila es un momento de un botón. A la izquierda, cómo funciona hoy, con los componentes de la app. Al lado, las opciones para comparar y elegir. Todo se puede tocar. «Lenta» pasa todo el movimiento a un cuarto de velocidad.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 self-start">
              <p className="text-[13px] font-semibold text-texto-suave">Velocidad</p>
              <Segmentos
                etiqueta="Velocidad"
                valor={velocidad}
                onCambio={setVelocidad}
                opciones={[
                  { valor: "normal", texto: "Normal" },
                  { valor: "lenta", texto: "Lenta" },
                ]}
              />
            </div>
          </header>
          {MOMENTOS.map((m, i) => (
            <Fila key={m.id} m={m} numero={i + 1} />
          ))}
        </div>
      </div>
    </div>
    </MotionConfig>
    </Velocidad.Provider>
  )
}
