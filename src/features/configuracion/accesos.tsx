// Quién ve qué (Lau, 19–20/11). La lista dice lo que ve cada uno de un vistazo y, al
// tocar a alguien, sube su ficha: una tabla con una fila por sección y una columna por
// nivel (No ve · Mira · Anota · Avisa, cada una con su ícono). Se marca con un toque, se
// guarda al instante, dice qué cambió con Deshacer, y a la persona le llega en vivo
// (migración 20261120120000). Qué significa cada nivel está plegado: no se repite entero
// en la ficha de cada uno. Igual en la compu y en el celular (diseño en /estilo/accesos).
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { SECCIONES_CON_PERMISO, nombreRol, type Nivel, type Niveles, type SeccionConPermiso } from '@/features/empresa/secciones'
import { cn } from '@/lib/utils'
import { celularLindo, useCambiarNiveles, useQuitarPersona, type Persona } from './api'

/** Los niveles como columnas: el nombre corto, su ícono y qué pasa (lo que hacen la base y el bot). */
const COLS: { id: Nivel; titulo: string; explica: string }[] = [
  { id: 'no', titulo: 'No ve', explica: 'No le aparece en la app. Si le pregunta al bot, le dice que te lo pida a vos.' },
  { id: 've', titulo: 'Mira', explica: 'Lo ve en la app y le pregunta al bot, pero no puede cargar, corregir ni borrar.' },
  { id: 'carga', titulo: 'Anota', explica: 'Lo ve y carga desde la app o por WhatsApp. Cada cosa queda con su nombre.' },
  { id: 'solo_manda', titulo: 'Avisa', explica: 'No ve nada. Te manda por WhatsApp lo que pasa y te llega como nuevo, con su nombre, para que lo revises.' },
]
const ARTICULO: Record<SeccionConPermiso, string> = { hacienda: 'la Hacienda', campos: 'los Campos', plata: 'la Plata y la Agenda' }
const COLOR: Record<Nivel, string> = {
  no: 'bg-neutro-100 text-texto-suave',
  ve: 'bg-superficie-hundida text-texto',
  carga: 'bg-pasto-100 text-pasto-800',
  solo_manda: 'bg-[#dcf8c6] text-[#1fae55]',
}
const titulo = (n: Nivel) => COLS.find((c) => c.id === n)!.titulo

/** El ícono de cada nivel en su círculo de color: el ojo tachado, el ojo, el lápiz y WhatsApp. */
export function IconoNivel({ n, chico = false }: { n: Nivel; chico?: boolean }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full', chico ? 'size-7' : 'size-9', COLOR[n])}>
      {n === 'solo_manda' ? <LogoWhatsapp className={chico ? 'size-4' : 'size-[18px]'} /> : <Icono nombre={n === 'no' ? 'Ocultar' : n === 've' ? 'Ver' : 'Editar'} tamano={16} />}
    </span>
  )
}

/** Lo que cambió, dicho para el dueño: «Paula ahora mira la Plata y la Agenda, sin cargar.» */
function queCambio(nombre: string, s: SeccionConPermiso, n: Nivel): string {
  const a = ARTICULO[s]
  if (n === 'no') return `${nombre} ya no ve ${a}.`
  if (n === 've') return `${nombre} ahora mira ${a}, sin cargar.`
  if (n === 'carga') return `${nombre} ahora ve y anota en ${a}.`
  return `${nombre} ahora te avisa por WhatsApp lo de ${a}.`
}

/** Qué es cada nivel: plegado, para no repetirlo entero en la ficha de cada persona. */
export function Leyenda() {
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

const FILA = 'grid grid-cols-[6.4em_repeat(4,minmax(36px,1fr))] gap-x-1 px-3'

/**
 * La tabla de niveles: una fila por sección, una columna por nivel, un toque marca.
 * La usan la ficha de cada persona y el formulario de invitar. `cuidarUltima`: la
 * última sección con algo no puede quedar en «No ve» (para eso se saca el acceso).
 * Sin nivel elegido (al invitar), la fila queda sin marcar.
 */
export function TablaNiveles({
  etiqueta,
  niveles,
  whatsapp,
  onElegir,
  ocupado = false,
  cuidarUltima = false,
}: {
  etiqueta: string
  niveles: Niveles
  whatsapp: boolean
  onElegir: (s: SeccionConPermiso, n: Nivel) => void
  ocupado?: boolean
  cuidarUltima?: boolean
}) {
  const conAlgo = SECCIONES_CON_PERMISO.filter((s) => niveles[s.id] && niveles[s.id] !== 'no')
  return (
        <div role="table" aria-label={etiqueta} className="overflow-hidden rounded-[18px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]">
          <div role="row" className={cn(FILA, 'items-end border-b border-borde bg-superficie-hundida/60 py-2')}>
            <span role="columnheader" />
            {COLS.map((c) => (
              <span key={c.id} role="columnheader" className="flex min-w-0 flex-col items-center gap-1 text-center text-[11.5px] leading-tight font-bold whitespace-nowrap text-texto-suave max-[350px]:text-[10.5px]">
                <IconoNivel n={c.id} chico />
                {c.titulo}
              </span>
            ))}
          </div>
          {SECCIONES_CON_PERMISO.map((s) => {
            const actual = niveles[s.id]
            const ultima = cuidarUltima && conAlgo.length === 1 && conAlgo[0]!.id === s.id
            return (
              <div key={s.id} role="row" className={cn(FILA, 'items-center border-b border-borde/70 py-1 last:border-b-0')}>
                <span role="rowheader" className="text-[14.5px] leading-tight font-semibold text-texto">
                  {s.texto}
                </span>
                {COLS.map((c) => {
                  const si = actual === c.id
                  // La última sección con algo no queda en «No ve»: para eso se le saca el acceso.
                  const unica = ultima && c.id === 'no' && !si
                  // Quien entra sólo por WhatsApp no usa la app: ni mira ni anota ahí.
                  const porWhatsapp = whatsapp && (c.id === 've' || c.id === 'carga')
                  const off = unica || porWhatsapp
                  return (
                    <span key={c.id} role="cell" className="flex justify-center">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={si}
                        aria-label={`${s.texto}: ${c.titulo}`}
                        title={unica ? 'Es lo único que le queda: para que no entre más, sacale el acceso.' : porWhatsapp ? 'Entra sólo por WhatsApp.' : undefined}
                        disabled={off || ocupado}
                        onClick={() => onElegir(s.id, c.id)}
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
  )
}

/** La ficha de una persona: la tabla, lo que cambió y sacarle el acceso. */
function Ficha({ p, abierto, onCerrar }: { p: Persona; abierto: boolean; onCerrar: () => void }) {
  const cambiar = useCambiarNiveles()
  const quitar = useQuitarPersona()
  // Lo que se ve en la tabla: cambia al toque y vuelve atrás si la base no lo acepta.
  const [niveles, setNiveles] = useState<Niveles>(p.niveles ?? {})
  const [hecho, setHecho] = useState<{ s: SeccionConPermiso; antes: Niveles } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seguro, setSeguro] = useState(false)
  const whatsapp = p.acceso === 'whatsapp'
  const nombre = p.nombre.split(' ')[0]!.replace(/^(Dra?|Ing)\.?$/i, p.nombre.split(' ')[1] ?? p.nombre)

  async function guardar(s: SeccionConPermiso, n: Nivel) {
    const antes = niveles
    if ((antes[s] ?? 'no') === n) return
    const despues: Niveles = { ...antes, [s]: n }
    setError(null)
    setNiveles(despues)
    try {
      await cambiar.mutateAsync({ userId: p.userId!, niveles: despues })
      setHecho({ s, antes })
    } catch (e) {
      setNiveles(antes)
      setError(e instanceof Error ? e.message : 'No se guardó. Revisá la conexión y probá de nuevo.')
    }
  }

  async function deshacer() {
    if (!hecho) return
    const antes = hecho.antes
    setHecho(null)
    setNiveles(antes)
    try {
      await cambiar.mutateAsync({ userId: p.userId!, niveles: antes })
    } catch {
      setError('No pudimos deshacerlo. Probá de nuevo.')
    }
  }

  async function sacar() {
    try {
      await quitar.mutateAsync(p)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.')
    }
  }

  const detalle = [nombreRol(p.rol), p.celular ? celularLindo(p.celular) : null].filter(Boolean).join(' · ')

  return (
    <PanelLateral abierto={abierto} onCerrar={onCerrar} titulo={p.nombre} bajada={whatsapp ? `${detalle} · Entra sólo por WhatsApp` : detalle}>
      <div className="flex flex-col gap-4">
        {/* La tabla: una fila por sección, un toque marca el nivel. */}
        <TablaNiveles etiqueta={`Qué puede hacer ${nombre}`} niveles={niveles} whatsapp={whatsapp} ocupado={cambiar.isPending} onElegir={(s, n) => void guardar(s, n)} cuidarUltima />

        {/* Lo que pasó, ahí mismo, con Deshacer. */}
        <AnimatePresence mode="wait">
          {hecho && (
            <motion.div
              key={`${hecho.s}${niveles[hecho.s]}`}
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="-mt-1 flex items-start gap-2.5 rounded-[14px] bg-pasto-50 px-3 py-2.5 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-pasto-200)]"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-pasto-600 text-white">
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-texto">{queCambio(nombre, hecho.s, niveles[hecho.s] ?? 'no')}</span>
                <span className="block text-[12.5px] text-texto-suave">Se guardó. En su celular se actualiza solo, al instante.</span>
              </span>
              <button type="button" onClick={() => void deshacer()} className="shrink-0 font-semibold underline underline-offset-2">
                Deshacer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="rounded-[14px] bg-estado-problema-suave px-3.5 py-2.5 text-[13.5px] font-semibold text-estado-problema-texto">{error}</p>}

        <Leyenda />

        {/* Sacarle el acceso: secundario, y antes de confirmar dice qué pasa. */}
        {seguro ? (
          <div className="rounded-[18px] bg-superficie p-3.5 shadow-[inset_0_0_0_1px_var(--borde)]">
            <p className="text-[14.5px] font-bold text-texto">¿Le sacás el acceso a {nombre}?</p>
            <p className="mt-1 text-[13.5px] text-texto-suave">Deja de entrar y el bot no le contesta. Lo que cargó queda, con su nombre. Si te arrepentís, lo invitás de nuevo.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void sacar()} disabled={quitar.isPending} className="h-10 flex-1 rounded-full bg-tinta px-4 text-[14px] font-bold text-white disabled:opacity-60">
                Sí, sacarle el acceso
              </button>
              <button type="button" onClick={() => setSeguro(false)} className="h-10 rounded-full px-4 text-[14px] font-bold text-texto shadow-[inset_0_0_0_1px_var(--borde)]">
                No
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setSeguro(true)} className="flex items-center justify-center gap-2 self-center rounded-full px-4 py-2 text-[14px] font-semibold text-texto-suave hover:bg-superficie-hundida">
            <Icono nombre="Salir" tamano={16} />
            Sacarle el acceso
          </button>
        )}
      </div>
    </PanelLateral>
  )
}

/** Lo que ve cada uno en la lista: un ícono por sección, con el del nivel cuando ve algo. */
function Resumen({ p }: { p: Persona }) {
  if (p.niveles === null) return <span className="text-[12.5px] text-texto-suave">Ve y anota todo</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {SECCIONES_CON_PERMISO.map((s) => {
        const n = p.niveles?.[s.id] ?? 'no'
        return (
          <span
            key={s.id}
            aria-label={`${s.texto}: ${titulo(n)}`}
            className={cn('inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-[12px] font-bold', n === 'no' ? 'text-texto-suave/45 line-through' : COLOR[n])}
          >
            <Icono nombre={s.icono} tamano={16} />
            {n !== 'no' && titulo(n)}
          </span>
        )
      })}
    </span>
  )
}

function Avatar({ p }: { p: Persona }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full font-heading text-[14px] font-extrabold sm:size-10 sm:text-[15px]', p.rol === 'dueno' ? 'bg-principal text-principal-texto' : 'bg-acento text-acento-texto')}>
      {p.nombre.charAt(0).toUpperCase()}
    </span>
  )
}

/** La lista de quién ve qué. Tocar a alguien abre su ficha. */
export function ListaAccesos({ personas }: { personas: Persona[] }) {
  const [abierta, setAbierta] = useState<Persona | null>(null)
  // La última abierta queda mientras el panel se va.
  const [ultima, setUltima] = useState<Persona | null>(null)
  if (abierta && abierta !== ultima) setUltima(abierta)
  const p = abierta ?? ultima
  return (
    <section aria-label="Quién ve qué" className="overflow-hidden rounded-[18px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)] sm:rounded-[24px]">
      <ul className="divide-y divide-borde/70">
        {personas.map((x) => {
          const tocable = !x.soyYo && x.rol !== 'dueno'
          return (
            <li key={x.userId}>
              <button type="button" disabled={!tocable} onClick={() => setAbierta(x)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors enabled:hover:bg-superficie-hundida/50 sm:px-5 sm:py-3.5">
                <Avatar p={x} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-texto sm:text-[16px]">
                    {x.nombre}
                    {x.soyYo && <span className="font-normal text-texto-suave"> (vos)</span>}
                    <span className="font-normal text-texto-suave"> · {nombreRol(x.rol)}</span>
                    {x.acceso === 'whatsapp' && <span className="font-normal text-texto-suave"> · por WhatsApp</span>}
                  </span>
                  <span className="mt-1 block">
                    <Resumen p={x} />
                  </span>
                </span>
                {tocable && <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave/60" />}
              </button>
            </li>
          )
        })}
      </ul>
      {p && <Ficha key={p.userId} p={p} abierto={!!abierta} onCerrar={() => setAbierta(null)} />}
    </section>
  )
}
