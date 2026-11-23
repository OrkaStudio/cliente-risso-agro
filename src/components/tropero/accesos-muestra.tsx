// Muestra (20/11): la ficha de acceso como tabla (Lau: «algo más simple y claro, ¿y si
// hacemos una tabla?»). Una fila por sección, una columna por nivel: se marca con un
// toque. Qué significa cada columna se dice una sola vez, abajo. Datos de ejemplo.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import grano from '@/assets/tropero/grano.png'
import { cn } from '@/lib/utils'

import { LogoWhatsapp } from './audio-whatsapp'
import { Icono } from './icono'

type Nivel = 'no' | 've' | 'carga' | 'solo_manda'
type Sec = 'hacienda' | 'campos' | 'plata'

const SECS: { id: Sec; texto: string; articulo: string }[] = [
  { id: 'hacienda', texto: 'Hacienda', articulo: 'la Hacienda' },
  { id: 'campos', texto: 'Campos', articulo: 'los Campos' },
  { id: 'plata', texto: 'Plata y Agenda', articulo: 'la Plata y la Agenda' },
]
const COLS: { id: Nivel; titulo: string; explica: string }[] = [
  { id: 'no', titulo: 'No ve', explica: 'No le aparece en la app. Si le pregunta al bot, le dice que te lo pida a vos.' },
  { id: 've', titulo: 'Mira', explica: 'Lo ve en la app y le pregunta al bot, pero no puede cargar, corregir ni borrar.' },
  { id: 'carga', titulo: 'Anota', explica: 'Lo ve y carga desde la app o por WhatsApp. Cada cosa queda con su nombre.' },
  { id: 'solo_manda', titulo: 'Avisa', explica: 'No ve nada. Te manda por WhatsApp lo que pasa y te llega como nuevo, con su nombre, para que lo revises.' },
]

/** El ícono de cada nivel, en su círculo de color (los de la app, sin emojis). */
const MARCA: Record<Nivel, { fondo: string }> = {
  no: { fondo: 'bg-neutro-100 text-texto-suave' },
  ve: { fondo: 'bg-superficie-hundida text-texto' },
  carga: { fondo: 'bg-pasto-100 text-pasto-800' },
  solo_manda: { fondo: 'bg-[#dcf8c6] text-[#1fae55]' },
}
function IconoNivel({ n, chico = false }: { n: Nivel; chico?: boolean }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full', chico ? 'size-7' : 'size-9', MARCA[n].fondo)}>
      {n === 'solo_manda' ? <LogoWhatsapp className={chico ? 'size-4' : 'size-[18px]'} /> : <Icono nombre={n === 'no' ? 'Ocultar' : n === 've' ? 'Ver' : 'Editar'} tamano={16} />}
    </span>
  )
}

/** Qué es cada nivel: plegado, para no repetirlo entero en la ficha de cada persona. */
function Leyenda() {
  const [abierta, setAbierta] = useState(false)
  return (
    <section aria-label="Qué significa cada una" className="rounded-[16px] bg-superficie-hundida/50">
      <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] font-semibold text-texto">
        <Icono nombre="Ayuda" tamano={16} />
        <span className="flex-1">¿Qué significa cada una?</span>
        <motion.span animate={{ rotate: abierta ? 90 : 0 }} className="text-texto-suave">
          <Icono nombre="Siguiente" tamano={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {abierta && (
          <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-col gap-3 overflow-hidden px-3 pb-3">
            {COLS.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <IconoNivel n={c.id} />
                <div className="min-w-0">
                  <dt className="text-[14px] leading-tight font-bold text-texto">{c.titulo}</dt>
                  <dd className="mt-0.5 text-[13px] leading-snug text-texto-suave">{c.explica}</dd>
                </div>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Lo que cambió, dicho para el dueño: «Paula ahora mira la Plata y la Agenda, sin cargar.» */
function queCambio(s: Sec, x: Nivel): string {
  const a = SECS.find((v) => v.id === s)!.articulo
  if (x === 'no') return `Paula ya no ve ${a}.`
  if (x === 've') return `Paula ahora mira ${a}, sin cargar.`
  if (x === 'carga') return `Paula ahora ve y anota en ${a}.`
  return `Paula ahora te avisa por WhatsApp lo de ${a}.`
}

function Ficha() {
  const [n, setN] = useState<Record<Sec, Nivel>>({ hacienda: 'carga', campos: 'no', plata: 'no' })
  const [hecho, setHecho] = useState<{ s: Sec; antes: Nivel } | null>(null)
  const [sacar, setSacar] = useState(false)
  const conAlgo = SECS.filter((s) => n[s.id] !== 'no')
  const elegir = (s: Sec, x: Nivel) => {
    if (n[s] === x) return
    setHecho({ s, antes: n[s] })
    setN((v) => ({ ...v, [s]: x }))
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-acento font-heading text-[17px] font-extrabold text-acento-texto">P</span>
        <div className="min-w-0">
          <p className="titulo-display text-[21px] leading-tight text-texto">Dra. Paula Ríos</p>
          <p className="text-[13.5px] text-texto-suave">Veterinaria · <span className="whitespace-nowrap">+54 9 2241 63-5525</span></p>
        </div>
      </div>

      {/* La tabla: una fila por sección, un toque marca el nivel. */}
      <div role="table" aria-label="Qué puede hacer Paula" className="overflow-hidden rounded-[18px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]">
        <div role="row" className="grid grid-cols-[6.4em_repeat(4,minmax(36px,1fr))] items-end gap-x-1 border-b border-borde bg-superficie-hundida/60 px-3 py-2">
          <span role="columnheader" />
          {COLS.map((c) => (
            <span key={c.id} role="columnheader" className="flex min-w-0 flex-col items-center gap-1 text-center text-[11.5px] leading-tight font-bold whitespace-nowrap text-texto-suave max-[350px]:text-[10.5px]">
              <IconoNivel n={c.id} chico />
              {c.titulo}
            </span>
          ))}
        </div>
        {SECS.map((s) => {
          const ultima = conAlgo.length === 1 && conAlgo[0]!.id === s.id
          return (
            <div key={s.id} role="row" className="grid grid-cols-[6.4em_repeat(4,minmax(36px,1fr))] items-center gap-x-1 border-b border-borde/70 px-3 py-1 last:border-b-0">
              <span role="rowheader" className="flex min-w-0 items-center gap-2 text-[14.5px] leading-tight font-semibold text-texto">
                <span>{s.texto}</span>
              </span>
              {COLS.map((c) => {
                const si = n[s.id] === c.id
                // La última sección con algo no puede quedar en «No ve»: se saca el acceso abajo.
                const off = ultima && c.id === 'no' && !si
                return (
                  <span key={c.id} role="cell" className="flex justify-center">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={si}
                      aria-label={`${s.texto}: ${c.titulo}`}
                      disabled={off}
                      onClick={() => elegir(s.id, c.id)}
                      className={cn('grid size-10 place-items-center rounded-full transition-colors max-[350px]:size-9', !si && !off && 'hover:bg-superficie-hundida', off && 'opacity-30')}
                    >
                      <span className={cn('grid size-[22px] place-items-center rounded-full border-2 transition-colors', si ? (c.id === 'no' ? 'border-texto-suave bg-texto-suave' : 'border-principal bg-principal') : 'border-neutro-300 bg-white')}>
                        {si && (
                          <svg viewBox="0 0 24 24" className="size-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            {c.id === 'no' ? <path d="M7 12h10" /> : <path d="m5 12.5 4.5 4.5L19 7.5" />}
                          </svg>
                        )}
                      </span>
                    </button>
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Lo que pasó, ahí mismo. */}
      <AnimatePresence mode="wait">
        {hecho && (
          <motion.p key={`${hecho.s}${n[hecho.s]}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mt-1 flex items-start gap-2.5 rounded-[14px] bg-pasto-50 px-3 py-2.5 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-pasto-200)]">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-pasto-600 text-white">
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-texto">{queCambio(hecho.s, n[hecho.s])}</span>
              <span className="block text-[12.5px] text-texto-suave">Se guardó. En su celular se actualiza solo, al instante.</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setN((v) => ({ ...v, [hecho.s]: hecho.antes }))
                setHecho(null)
              }}
              className="ml-auto shrink-0 font-semibold underline underline-offset-2"
            >
              Deshacer
            </button>
          </motion.p>
        )}
      </AnimatePresence>

      <Leyenda />

      {sacar ? (
        <div className="rounded-[18px] bg-superficie p-3.5 shadow-[inset_0_0_0_1px_var(--borde)]">
          <p className="text-[14.5px] font-bold text-texto">¿Le sacás el acceso a Paula?</p>
          <p className="mt-1 text-[13.5px] text-texto-suave">Deja de entrar y el bot no le contesta. Lo que cargó queda.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="h-10 flex-1 rounded-full bg-tinta px-4 text-[14px] font-bold text-white">
              Sí, sacarle el acceso
            </button>
            <button type="button" onClick={() => setSacar(false)} className="h-10 rounded-full px-4 text-[14px] font-bold text-texto shadow-[inset_0_0_0_1px_var(--borde)]">
              No
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setSacar(true)} className="flex items-center justify-center gap-2 self-center rounded-full px-4 py-2 text-[14px] font-semibold text-texto-suave hover:bg-superficie-hundida">
          <Icono nombre="Salir" tamano={16} />
          Sacarle el acceso
        </button>
      )}
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 px-1 text-[12px] font-bold tracking-[0.06em] text-[#5c4e40] uppercase">{children}</p>
}

export function AccesosMuestra() {
  return (
    <div className="relative isolate h-dvh overflow-y-auto bg-[#fff8ec]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-90 [background-size:120px_120px]" style={{ backgroundImage: `url(${grano})` }} />
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-start justify-center gap-10 px-4 py-6">
        <div className="w-full max-w-[390px]">
          <Rotulo>Celular · la ficha que sube</Rotulo>
          <div className="rounded-t-[28px] bg-fondo px-5 pt-5 pb-6 shadow-[0_-12px_40px_rgba(19,27,22,0.12)]">
            <Ficha />
          </div>
        </div>
        <div className="w-full max-w-[520px]">
          <Rotulo>Compu · el panel de la derecha</Rotulo>
          <div className="rounded-l-[28px] bg-fondo px-8 pt-8 pb-8 shadow-[-12px_0_40px_rgba(19,27,22,0.12)]">
            <Ficha />
          </div>
        </div>
      </div>
    </div>
  )
}
