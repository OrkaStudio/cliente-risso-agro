import { useNavigate } from 'react-router-dom'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
import { BORRADOR, DATOS, ETIQUETAS, FECHA_LEGALES, PRIVACIDAD, RESUMEN, TERMINOS, type Bloque, type Seccion } from './textos'

type Doc = 'resumen' | 'terminos' | 'privacidad'

const PESTANAS: { doc: Doc; etiqueta: string; ruta: string }[] = [
  { doc: 'resumen', etiqueta: 'En simple', ruta: '/legales' },
  { doc: 'terminos', etiqueta: 'Términos', ruta: '/terminos' },
  { doc: 'privacidad', etiqueta: 'Privacidad', ruta: '/privacidad' },
]

const TITULOS: Record<Doc, { titulo: string; bajada: string }> = {
  resumen: { titulo: 'Tus datos, en simple', bajada: 'Qué hacemos y qué no con lo que cargás en Troppero.' },
  terminos: { titulo: 'Términos y condiciones', bajada: 'El acuerdo entre vos y Troppero para usar el servicio.' },
  privacidad: { titulo: 'Política de privacidad', bajada: 'Qué datos usamos, para qué y qué derechos tenés.' },
}

/**
 * Términos, privacidad y su resumen (Lau, 12/11): una sola página con tres
 * pestañas, abierta sin sesión (se llega desde el login y el registro).
 */
export function LegalesPage({ doc }: { doc: Doc }) {
  const navigate = useNavigate()
  const { titulo, bajada } = TITULOS[doc]
  return (
    <div className="h-full overflow-y-auto bg-fondo">
      <header className="sticky top-0 z-10 border-b border-borde bg-fondo/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1040px] items-center justify-between gap-4 px-5">
          <button type="button" onClick={() => navigate('/')} aria-label="Ir a Troppero">
            <Logo alto={24} />
          </button>
          <nav className="flex gap-1" aria-label="Documentos">
            {PESTANAS.map((p) => (
              <button
                key={p.doc}
                type="button"
                onClick={() => navigate(p.ruta, { replace: true })}
                aria-current={p.doc === doc ? 'page' : undefined}
                className={cn(
                  'min-h-10 rounded-full px-3 text-[14px] font-semibold transition-colors',
                  p.doc === doc ? 'bg-principal-suave text-principal' : 'text-texto-suave hover:text-texto',
                )}
              >
                {p.etiqueta}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] px-5 pt-10 pb-20 md:pt-14">
        <div className="flex max-w-[680px] flex-col gap-2">
          <h1 className="t-pagina text-texto">{titulo}</h1>
          <p className="text-[17px] leading-snug text-texto-suave">{bajada}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-texto-suave">
            Vigente desde el {FECHA_LEGALES}
            {BORRADOR && <span className="rounded-full bg-acento/40 px-2.5 py-0.5 text-[12px] font-bold text-acento-texto">Borrador: falta la revisión legal</span>}
          </p>
        </div>
        {doc === 'resumen' ? <Resumen /> : <Documento secciones={doc === 'terminos' ? TERMINOS : PRIVACIDAD} />}
      </main>
    </div>
  )
}

function Resumen() {
  const navigate = useNavigate()
  return (
    <div className="mt-10 flex max-w-[880px] flex-col gap-10">
      <div className="grid gap-4 md:grid-cols-2">
        <Lista titulo="Lo que hacemos" items={RESUMEN.hacemos} icono="Guardar" />
        <Lista titulo="Lo que no hacemos" items={RESUMEN.noHacemos} icono="Cerrar" />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="t-tarjeta text-texto">Lo que tenés que saber</h2>
        <ul className="flex flex-col gap-2.5">
          {RESUMEN.saber.map((t) => (
            <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed text-texto">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-principal" />
              <span>
                <ConDatos texto={t} />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-[14px] text-texto-suave">
        Esto es un resumen. Lo que rige son los{' '}
        <button type="button" onClick={() => navigate('/terminos', { replace: true })} className="font-semibold text-principal hover:underline">
          Términos
        </button>{' '}
        y la{' '}
        <button type="button" onClick={() => navigate('/privacidad', { replace: true })} className="font-semibold text-principal hover:underline">
          Política de privacidad
        </button>
        .
      </p>
    </div>
  )
}

function Lista({ titulo, items, icono }: { titulo: string; items: { titulo: string; texto: string }[]; icono: 'Guardar' | 'Cerrar' }) {
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-borde bg-superficie p-6">
      <h2 className="t-tarjeta text-texto">{titulo}</h2>
      <ul className="flex flex-col gap-4">
        {items.map((it) => (
          <li key={it.titulo} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
              <Icono nombre={icono} tamano={16} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15.5px] font-semibold text-texto">{it.titulo}</span>
              <span className="text-[14px] leading-snug text-texto-suave">{it.texto}</span>
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
    <div className="mt-10 grid gap-10 md:grid-cols-[220px_minmax(0,680px)] md:gap-14">
      <nav aria-label="En esta página" className="hidden md:block">
        <ol className="sticky top-24 flex flex-col gap-0.5 text-[13.5px]">
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
