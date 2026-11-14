import { useNavigate } from 'react-router-dom'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
import fotoCampo from '@/assets/tropero/campo-aereo.webp'
import { BORRADOR, DATOS, ETIQUETAS, FECHA_LEGALES, PRIVACIDAD, RESUMEN, TERMINOS, type Bloque, type Seccion } from './textos'

type Doc = 'resumen' | 'terminos' | 'privacidad'

const PESTANAS: { doc: Doc; etiqueta: string; ruta: string }[] = [
  { doc: 'resumen', etiqueta: 'Resumen', ruta: '/legales' },
  { doc: 'terminos', etiqueta: 'Términos', ruta: '/terminos' },
  { doc: 'privacidad', etiqueta: 'Privacidad', ruta: '/privacidad' },
]

const TITULOS: Record<Doc, { titulo: string; bajada: string }> = {
  resumen: { titulo: 'Tus datos son tuyos', bajada: 'El resumen de qué hacemos y qué no con lo que cargás en Troppero.' },
  terminos: { titulo: 'Términos y condiciones', bajada: 'El acuerdo entre vos y Troppero para usar el servicio.' },
  privacidad: { titulo: 'Política de privacidad', bajada: 'Qué datos usamos, para qué y qué derechos tenés.' },
}

/**
 * Términos, privacidad y su resumen (Lau, 12–13/11): una sola página con tres
 * pestañas, abierta sin sesión (se llega desde el login y el registro). Arriba,
 * la foto del campo con el título, como el acceso; las pestañas montadas sobre
 * su borde.
 */
export function LegalesPage({ doc }: { doc: Doc }) {
  const navigate = useNavigate()
  const { titulo, bajada } = TITULOS[doc]
  return (
    <div className="h-full overflow-y-auto bg-fondo">
      <header className="relative isolate overflow-hidden bg-terracota-800">
        <img src={fotoCampo} alt="" className="absolute inset-0 -z-10 size-full object-cover object-[50%_40%]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(19,27,22,0.55)_0%,rgba(19,27,22,0.78)_100%)]" />
        <div className="mx-auto max-w-[1040px] px-5 pt-[max(20px,env(safe-area-inset-top))] pb-16 md:pb-20">
          <button type="button" onClick={() => navigate('/')} aria-label="Ir a Troppero" className="mt-1">
            <Logo tono="hueso" alto={24} />
          </button>
          <div className="mt-10 flex max-w-[680px] flex-col gap-3 md:mt-14">
            <h1 className="titulo-display text-[clamp(34px,8vw,56px)] leading-[1] tracking-[-0.03em] text-superficie">{titulo}</h1>
            <p className="text-[17px] leading-snug text-superficie/85">{bajada}</p>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-superficie/70">
              {BORRADOR ? 'Versión del' : 'Vigente desde el'} {FECHA_LEGALES}
              {BORRADOR && <span className="rounded-full bg-acento px-2.5 py-0.5 text-[12px] font-bold text-acento-texto">Borrador: falta la revisión legal</span>}
            </p>
          </div>
        </div>
      </header>

      {/* Las pestañas, montadas sobre el borde de la foto; quedan arriba al bajar. */}
      <nav aria-label="Documentos" className="sticky top-0 z-10 -mt-7">
        <div className="mx-auto flex max-w-[1040px] px-5">
          <div className="flex gap-1 rounded-full border border-borde bg-superficie p-1 shadow-[0_8px_24px_rgba(19,27,22,0.12)]">
            {PESTANAS.map((p) => (
              <button
                key={p.doc}
                type="button"
                onClick={() => navigate(p.ruta, { replace: true })}
                aria-current={p.doc === doc ? 'page' : undefined}
                className={cn(
                  'h-11 rounded-full px-4 text-[14.5px] font-bold whitespace-nowrap transition-colors sm:px-5',
                  p.doc === doc ? 'bg-principal text-principal-texto' : 'text-texto-suave hover:text-texto',
                )}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1040px] px-5 pt-10 pb-20">
        {doc === 'resumen' ? <Resumen /> : <Documento secciones={doc === 'terminos' ? TERMINOS : PRIVACIDAD} />}
      </main>
    </div>
  )
}

function Resumen() {
  const navigate = useNavigate()
  return (
    <div className="flex max-w-[920px] flex-col gap-12">
      <div className="grid gap-10 md:grid-cols-2 md:gap-12">
        <Lista titulo="Lo que hacemos" items={RESUMEN.hacemos} icono="Guardar" tono="si" />
        <Lista titulo="Lo que no hacemos" items={RESUMEN.noHacemos} icono="Cerrar" tono="no" />
      </div>
      <section className="rounded-[24px] bg-acento/25 p-6 md:p-8">
        <h2 className="t-tarjeta text-texto">Lo que tenés que saber</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-2">
          {RESUMEN.saber.map((t, i) => (
            <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed text-texto">
              <span className="t-cifra-chica grid size-7 shrink-0 place-items-center rounded-full bg-superficie font-bold text-acento-texto">{i + 1}</span>
              <span>
                <ConDatos texto={t} />
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-texto-suave">Esto es un resumen. Lo que rige son los documentos completos:</p>
        <div className="flex flex-wrap gap-2.5">
          {PESTANAS.slice(1).map((p) => (
            <button key={p.doc} type="button" onClick={() => navigate(p.ruta, { replace: true })} className="inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] border-principal px-5 text-[15px] font-bold text-principal hover:bg-principal-suave">
              Leer {p.doc === 'terminos' ? 'los Términos' : 'la Privacidad'}
              <Icono nombre="Siguiente" tamano={16} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Una columna de puntos: sin caja, el ícono lleva el sentido (sí en terracota, no en tinta). */
function Lista({ titulo, items, icono, tono }: { titulo: string; items: { titulo: string; texto: string }[]; icono: 'Guardar' | 'Cerrar'; tono: 'si' | 'no' }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="t-seccion text-texto">{titulo}</h2>
      <ul className="flex flex-col gap-5">
        {items.map((it) => (
          <li key={it.titulo} className="flex gap-3.5">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tono === 'si' ? 'bg-principal text-principal-texto' : 'bg-superficie-hundida text-texto')}>
              <Icono nombre={icono} tamano={16} />
            </span>
            <span className="flex flex-col gap-0.5 pt-1">
              <span className="text-[16px] font-bold text-texto">{it.titulo}</span>
              <span className="text-[14.5px] leading-snug text-texto-suave">{it.texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Un documento largo: en la compu, el índice a la izquierda; en el celular, sólo el texto. */
function Documento({ secciones }: { secciones: Seccion[] }) {
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="grid gap-8 md:grid-cols-[220px_minmax(0,680px)] md:gap-14">
      {/* En el celular, los temas plegados arriba: se abren para saltar a uno. */}
      <details className="group rounded-[18px] border border-borde bg-superficie md:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-bold text-texto">
          Ver los {secciones.length} temas
          <Icono nombre="Desplegar" tamano={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <ol className="flex flex-col border-t border-borde px-2 py-2 text-[14.5px]">
          {secciones.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); ir(s.id) }} className="w-full rounded-lg px-2 py-2 text-left text-texto-suave hover:text-texto">
                <span className="t-cifra-mini mr-1.5 text-principal">{i + 1}.</span>
                {s.titulo}
              </button>
            </li>
          ))}
        </ol>
      </details>
      <nav aria-label="En esta página" className="hidden md:block">
        <ol className="sticky top-20 flex flex-col gap-0.5 text-[13.5px]">
          {secciones.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => ir(s.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-texto-suave hover:bg-principal-suave/60 hover:text-texto">
                <span className="t-cifra-mini mr-1.5 text-principal">{i + 1}.</span>
                {s.titulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-9">
        {secciones.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24 flex flex-col gap-3">
            <h2 className="t-tarjeta text-texto">
              <span className="text-principal">{i + 1}.</span> {s.titulo}
            </h2>
            {s.bloques.map((b, j) => (
              <Parrafo key={j} bloque={b} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function Parrafo({ bloque }: { bloque: Bloque }) {
  if (typeof bloque === 'string')
    return (
      <p className="text-[15.5px] leading-relaxed text-texto">
        <ConDatos texto={bloque} />
      </p>
    )
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {bloque.map((t) => (
        <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed text-texto">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-principal" />
          <span>
            <ConDatos texto={t} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Reemplaza `{dato}` por su valor; si todavía no está definido, lo marca. */
function ConDatos({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\{\w+\})/).map((parte, i) => {
        const clave = /^\{(\w+)\}$/.exec(parte)?.[1]
        if (!clave) return parte
        const valor = DATOS[clave]
        return valor ?? (
          <mark key={i} className="rounded bg-acento/40 px-1 text-acento-texto">
            a definir: {ETIQUETAS[clave] ?? clave}
          </mark>
        )
      })}
    </>
  )
}
