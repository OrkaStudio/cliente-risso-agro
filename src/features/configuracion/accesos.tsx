// Quién ve qué (Lau, 19–20/11). La lista dice lo que ve cada uno de un vistazo y, al
// tocar a alguien, sube su ficha: una tabla con una fila por sección y una columna por
// nivel (No ve · Mira · Anota · Avisa, cada una con su ícono). Se marca con un toque, se
// guarda al instante, dice qué cambió con Deshacer, y a la persona le llega en vivo
// (migración 20261120120000). Qué significa cada nivel está plegado: no se repite entero
// en la ficha de cada uno. Igual en la compu y en el celular (diseño en /estilo/accesos).
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Popover } from '@base-ui/react/popover'
import { toast } from 'sonner'

import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { SECCIONES_CON_PERMISO, accesoDeNiveles, nombreRol, type Nivel, type Niveles, type SeccionConPermiso } from '@/features/empresa/secciones'
import { cn } from '@/lib/utils'
import { useCambiarNiveles, useQuitarPersona, type Persona } from './api'

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
  onElegir,
  ocupado = false,
  cuidarUltima = false,
}: {
  etiqueta: string
  niveles: Niveles
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
              <span key={c.id} role="columnheader" className="flex min-w-0 flex-col items-center gap-1 text-center text-[13.5px] leading-tight font-bold whitespace-nowrap text-texto max-[350px]:text-[12px]">
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
                  // Un solo ingreso (25/11): cualquiera puede tener cualquier nivel; cómo entra sale de acá.
                  const off = unica
                  return (
                    <span key={c.id} role="cell" className="flex justify-center">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={si}
                        aria-label={`${s.texto}: ${c.titulo}`}
                        title={unica ? 'Es lo único que le queda: para que no entre más, sacale el acceso.' : undefined}
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

function Avatar({ p, grande = false }: { p: Persona; grande?: boolean }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full font-heading font-extrabold', grande ? 'size-11 text-[17px]' : 'size-9 text-[14px] sm:size-10 sm:text-[15px]', p.rol === 'dueno' ? 'bg-principal text-principal-texto' : 'bg-acento text-acento-texto')}>
      {p.nombre.charAt(0).toUpperCase()}
    </span>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const desdeCorto = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `desde el ${d.getDate()} de ${MES_CORTO[d.getMonth()]}`
}

/** «14/11»: la fecha corta, para que en el celular entre en el renglón. */
const desdeNumero = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${d.getDate()}/${d.getMonth() + 1}`
}

/** Cómo entra: por la app (el celular) o sólo por WhatsApp, con su ícono. */
function ComoEntra({ p }: { p: Persona }) {
  const wa = p.acceso === 'whatsapp'
  return (
    <span className="inline-flex items-center gap-1.5">
      {wa ? <LogoWhatsapp className="size-3.5 text-[#1fae55]" /> : <Icono nombre="Celular" tamano={16} className="text-texto-suave" />}
      {wa ? 'Por WhatsApp' : 'En la app'}
    </span>
  )
}

/** El nivel en una celda de la tabla: su ícono en color y el nombre; «No ve», apagado. */
function Nivel({ n }: { n: Nivel }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[14px] font-bold', n === 'no' ? 'text-texto-suave/60' : 'text-texto')}>
      <IconoNivel n={n} chico />
      {titulo(n)}
    </span>
  )
}

/** Quién es: avatar, nombre, rol, cómo entra y desde cuándo (y en el celular, lo que ve). */
function Quien({ p }: { p: Persona }) {
  const desde = desdeCorto(p.desde)
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 sm:gap-3.5">
      <Avatar p={p} grande />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[15px] font-bold text-texto sm:text-[16.5px]">{p.nombre}</span>
          {p.soyYo && <span className="text-[13.5px] text-texto-suave">(vos)</span>}
          <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', p.rol === 'dueno' ? 'bg-principal-suave text-principal' : 'bg-superficie-hundida text-texto')}>{nombreRol(p.rol)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-texto-suave">
          <ComoEntra p={p} />
          {desde && <span>· {desde}</span>}
        </span>
        <span className="mt-1.5 block sm:hidden">
          <Resumen p={p} />
        </span>
      </span>
    </span>
  )
}

/** El dueño (o vos): no se edita; ve y anota todo. */
function FilaFija({ p }: { p: Persona }) {
  return (
    <div className={cn('px-5 py-4', COLUMNAS)}>
      <Quien p={p} />
      {SECCIONES_CON_PERMISO.map((s) => (
        <span key={s.id}>
          {p.niveles === null ? (
            <span className="inline-flex items-center gap-2 px-2 text-[14px] font-bold text-texto">
              <span className="grid size-7 place-items-center rounded-full bg-principal-suave text-principal">
                <Icono nombre="Editar" tamano={16} />
              </span>
              Todo
            </span>
          ) : (
            <span className="px-2">
              <Nivel n={p.niveles[s.id] ?? 'no'} />
            </span>
          )}
        </span>
      ))}
      <span />
    </div>
  )
}

/**
 * Una persona que se edita en la tabla: cada celda se toca y despliega los cuatro
 * niveles con qué significa cada uno. Se guarda al toque, dice qué cambió con
 * Deshacer, y a la persona le llega en vivo. Al final, «⋯» para sacarle el acceso.
 */
/**
 * Lo que comparten la tabla de la compu y la fila del celular: los niveles de una
 * persona, cómo se guardan (al toque, con un solo «Deshacer» a la vista) y sacarle
 * el acceso. Si un cambio le da o le saca la app, el aviso lo dice.
 */
function useNivelesDe(p: Persona) {
  const cambiar = useCambiarNiveles()
  const quitar = useQuitarPersona()
  const [niveles, setNiveles] = useState<Niveles>(p.niveles ?? {})
  const nombre = p.nombre.split(' ')[0]!.replace(/^(Dra?|Ing)\.?$/i, p.nombre.split(' ')[1] ?? p.nombre)
  const conAlgo = SECCIONES_CON_PERMISO.filter((s) => niveles[s.id] && niveles[s.id] !== 'no')
  const ultimaEs = (s: SeccionConPermiso) => conAlgo.length === 1 && conAlgo[0]!.id === s

  async function guardar(s: SeccionConPermiso, n: Nivel) {
    const antes = niveles
    if ((antes[s] ?? 'no') === n) return
    const despues: Niveles = { ...antes, [s]: n }
    setNiveles(despues)
    try {
      await cambiar.mutateAsync({ userId: p.userId!, niveles: despues })
      // Si con esto gana o pierde la app, se dice (un solo ingreso, 25/11).
      const a = accesoDeNiveles(antes)
      const b = accesoDeNiveles(despues)
      const extra = a === b ? null : b === 'app' ? `Ya puede entrar a la app con su número y un código por WhatsApp.` : `Ya no usa la app: lo suyo va por WhatsApp.`
      // Un aviso por persona: el nuevo reemplaza al anterior, así el único «Deshacer»
      // a la vista es el del último cambio (Lau, 25/11: uno viejo pisaba los nuevos).
      toast.success(queCambio(nombre, s, n), {
        id: `niveles-${p.userId}`,
        description: extra ?? 'Le llega al instante, en su celular.',
        action: {
          label: 'Deshacer',
          onClick: () => {
            setNiveles(antes)
            cambiar.mutateAsync({ userId: p.userId!, niveles: antes }).then(
              () => toast.success(`Listo: ${nombre} quedó como antes`, { id: `niveles-${p.userId}-deshecho`, description: 'Le llega al instante, en su celular.' }),
              () => {
                setNiveles(despues)
                toast.error('No pudimos deshacerlo. Probá de nuevo.', { id: `niveles-${p.userId}` })
              },
            )
          },
        },
      })
    } catch (e) {
      setNiveles(antes)
      toast.error('No se guardó', { description: e instanceof Error ? e.message : 'Revisá la conexión y probá de nuevo.' })
    }
  }

  const sacar = () =>
    quitar.mutateAsync(p).then(
      () => toast.success(`Listo: ${nombre} ya no entra a tu campo`, { description: 'Lo que cargó queda, con su nombre. Para que vuelva, invitalo de nuevo.' }),
      (e) => toast.error('No se pudo', { description: e instanceof Error ? e.message : 'Probá de nuevo.' }),
    )

  return { niveles, nombre, guardar, sacar, ultimaEs, ocupado: cambiar.isPending, sacando: quitar.isPending }
}

function FilaEditable({ p }: { p: Persona }) {
  const x = useNivelesDe(p)
  return (
    <div className={cn('group/fila px-5 py-4 transition-colors hover:bg-superficie-hundida/25', COLUMNAS)}>
      <Quien p={{ ...p, acceso: accesoDeNiveles(x.niveles) }} />
      {SECCIONES_CON_PERMISO.map((s) => (
        <CeldaNivel key={s.id} seccion={s.texto} actual={x.niveles[s.id] ?? 'no'} ocupado={x.ocupado} ultima={x.ultimaEs(s.id)} onElegir={(n) => void x.guardar(s.id, n)} />
      ))}
      <MasOpciones nombre={x.nombre} ocupado={x.sacando} onSacar={() => void x.sacar()} />
    </div>
  )
}

/**
 * En el celular, igual que la tabla de la compu (Lau, 25/11: «simplifiquemos»): en
 * la fila de cada persona, cada sección es una pastilla con su ícono y su nivel, y
 * tocarla abre los cuatro para elegir. Sacarle el acceso, en «⋯». Sin desplegar nada.
 */
function FilaCelu({ p }: { p: Persona }) {
  const x = useNivelesDe(p)
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <Avatar p={p} grande />
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-bold text-texto">{p.nombre}</span>
            <span className="rounded-full bg-superficie-hundida px-2 py-0.5 text-[12px] font-bold text-texto">{nombreRol(p.rol)}</span>
          </span>
          {/* En un renglón (Lau, 25/11): «desde» no se parte ni arranca con el punto. */}
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-texto-suave">
            <ComoEntra p={{ ...p, acceso: accesoDeNiveles(x.niveles) }} />
            {desdeNumero(p.desde) && <span>· desde el {desdeNumero(p.desde)}</span>}
          </span>
        </div>
        <MasOpciones nombre={x.nombre} ocupado={x.sacando} onSacar={() => void x.sacar()} />
      </div>
      {/* Las tres secciones en un renglón entero, debajo: entran sin partirse. */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {SECCIONES_CON_PERMISO.map((s) => (
          <CeldaNivel key={s.id} chip={s.icono} nombre={x.nombre} seccion={s.texto} actual={x.niveles[s.id] ?? 'no'} ocupado={x.ocupado} ultima={x.ultimaEs(s.id)} onElegir={(n) => void x.guardar(s.id, n)} />
        ))}
      </div>
    </div>
  )
}

/** En el celular, una línea por nivel: lo justo para elegir sin leer un párrafo. */
const CORTO: Record<Nivel, string> = {
  no: 'No le aparece en la app ni en el bot.',
  ve: 'Lo ve, pero no carga ni corrige.',
  carga: 'Lo ve y carga, con su nombre.',
  solo_manda: 'Te lo manda por WhatsApp para que lo revises.',
}

/**
 * En el celular (Lau, 25/11: el menú flotante quedaba apretado y cortado): la pastilla
 * de cada sección abre una hoja desde abajo, como el resto de los formularios, con los
 * cuatro niveles en una línea cada uno. Tocar uno lo guarda y cierra.
 */
function PastillaNivel({ seccion, icono, nombre, actual, ocupado, ultima, onElegir }: { seccion: string; icono: NombreIcono; nombre: string; actual: Nivel; ocupado: boolean; ultima: boolean; onElegir: (n: Nivel) => void }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => setAbierta(true)}
        aria-label={`${seccion}: ${titulo(actual)}. Cambiar`}
        className={cn('inline-flex h-10 w-full items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold disabled:opacity-60', actual === 'no' ? 'bg-superficie-hundida text-texto-suave/70' : COLOR[actual])}
      >
        <Icono nombre={icono} tamano={16} />
        {titulo(actual)}
        <svg viewBox="0 0 24 24" className="size-3 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <PanelLateral chico abierto={abierta} onCerrar={() => setAbierta(false)} titulo={seccion} bajada={nombre ? `Qué puede hacer ${nombre}` : 'Qué puede hacer'}>
        <div role="radiogroup" aria-label={`Qué puede hacer en ${seccion}`} className="flex flex-col gap-2">
          {COLS.map((c) => {
            const si = actual === c.id
            const off = ultima && c.id === 'no' && !si
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={si}
                disabled={off}
                onClick={() => {
                  setAbierta(false)
                  if (!si) onElegir(c.id)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left transition-colors',
                  si ? 'bg-principal-suave shadow-[inset_0_0_0_1.5px_var(--principal)]' : 'bg-superficie shadow-[inset_0_0_0_1px_var(--borde)] active:bg-superficie-hundida',
                  off && 'opacity-40',
                )}
              >
                <IconoNivel n={c.id} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[15px] font-bold', si ? 'text-principal' : 'text-texto')}>{c.titulo}</span>
                  <span className="block text-[13.5px] leading-snug text-texto-suave">{off ? 'Es lo único que le queda: para eso, sacale el acceso.' : CORTO[c.id]}</span>
                </span>
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2', si ? 'border-principal bg-principal text-white' : 'border-neutro-300 bg-white')}>
                  {si && (
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}
          <p className="mt-1 px-1 text-[12.5px] leading-snug text-texto-suave">Con «Mira» o «Anota» en alguna sección, usa la app; si no, va sólo por WhatsApp.</p>
        </div>
      </PanelLateral>
    </>
  )
}

/** El dueño en el celular: el mismo molde que los demás, con «Todo» en cada sección (no se toca). */
function FilaCeluFija({ p }: { p: Persona }) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <Avatar p={p} grande />
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-bold text-texto">{p.nombre}</span>
            {p.soyYo && <span className="text-[13.5px] text-texto-suave">(vos)</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', p.rol === 'dueno' ? 'bg-principal-suave text-principal' : 'bg-superficie-hundida text-texto')}>{nombreRol(p.rol)}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-texto-suave">
            <ComoEntra p={p} />
            {desdeNumero(p.desde) && <span>· desde el {desdeNumero(p.desde)}</span>}
          </span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {SECCIONES_CON_PERMISO.map((s) => {
          const n = p.niveles === null ? null : (p.niveles?.[s.id] ?? 'no')
          return (
            <span key={s.id} aria-label={`${s.texto}: ${n === null ? 'todo' : titulo(n)}`} className={cn('inline-flex h-10 items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold', n === null ? 'bg-principal-suave text-principal' : n === 'no' ? 'bg-superficie-hundida text-texto-suave/70' : COLOR[n])}>
              <Icono nombre={s.icono} tamano={16} />
              {n === null ? 'Todo' : titulo(n)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Una celda de la tabla: muestra el nivel y, al tocarla, los cuatro para elegir. */
function CeldaNivel({ seccion, actual, ocupado, ultima, onElegir, chip, nombre = '' }: { seccion: string; actual: Nivel; ocupado: boolean; ultima: boolean; onElegir: (n: Nivel) => void; chip?: NombreIcono; nombre?: string }) {
  const [abierto, setAbierto] = useState(false)
  if (chip) return <PastillaNivel seccion={seccion} icono={chip} nombre={nombre} actual={actual} ocupado={ocupado} ultima={ultima} onElegir={onElegir} />
  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger
        disabled={ocupado}
        aria-label={`${seccion}: ${titulo(actual)}. Cambiar`}
        className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 transition-colors hover:bg-superficie-hundida data-[popup-open]:bg-superficie-hundida data-[popup-open]:shadow-[inset_0_0_0_1.5px_var(--principal)] disabled:opacity-60"
        >
        <Nivel n={actual} />
        <svg viewBox="0 0 24 24" className="size-3.5 text-texto-suave opacity-0 transition-opacity group-hover/fila:opacity-100" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={{ top: 16, left: 16, right: 16, bottom: 96 }} className="z-[1000]">
          <Popover.Popup className="popup-suave max-h-[var(--available-height)] w-[min(320px,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded-[20px] border border-borde bg-superficie p-1.5 shadow-[0_24px_56px_-16px_rgba(58,26,13,0.38)] outline-none">
            <Popover.Title className="px-3 pt-2 pb-1.5 text-[12.5px] font-bold tracking-[0.04em] text-texto-suave uppercase">{seccion}</Popover.Title>
            <div role="radiogroup" aria-label={`Qué puede hacer en ${seccion}`} className="flex flex-col gap-1">
              {COLS.map((c) => {
                const si = actual === c.id
                const off = ultima && c.id === 'no' && !si
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={si}
                    disabled={off}
                    onClick={() => {
                      setAbierto(false)
                      if (!si) onElegir(c.id)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors',
                      si ? 'bg-principal-suave shadow-[inset_0_0_0_1.5px_var(--principal)]' : 'enabled:hover:bg-superficie-hundida/60',
                      off && 'opacity-45',
                    )}
                  >
                    <IconoNivel n={c.id} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[14.5px] leading-tight font-bold', si ? 'text-principal' : 'text-texto')}>
                        {c.titulo}
                        {si && <span className="ml-1.5 text-[12px] font-semibold text-principal/80">· así está hoy</span>}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-texto-suave">{off ? 'Es lo único que le queda. Para que no entre más, sacale el acceso.' : c.explica}</span>
                    </span>
                    <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', si ? 'border-principal bg-principal text-white' : 'border-neutro-300 bg-white')}>
                      {si && (
                        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Cómo entra sale de los niveles: se avisa antes de elegir. */}
            <p className="mx-1.5 mt-1.5 mb-1 rounded-[12px] bg-superficie-hundida/60 px-3 py-2.5 text-[12.5px] leading-snug text-texto-suave">
              Con «Mira» o «Anota» en alguna sección, usa la app. Si en todas tiene «No ve» o «Avisa», va sólo por WhatsApp.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** «⋯» al final de la fila: sacarle el acceso, y antes de hacerlo dice qué pasa. */
function MasOpciones({ nombre, ocupado, onSacar }: { nombre: string; ocupado: boolean; onSacar: () => void }) {
  const [seguro, setSeguro] = useState(false)
  return (
    <Popover.Root onOpenChange={(v) => !v && setSeguro(false)}>
      <Popover.Trigger aria-label={`Más opciones de ${nombre}`} className="grid size-9 place-items-center justify-self-end rounded-full text-texto-suave transition-colors hover:bg-superficie-hundida hover:text-texto data-[popup-open]:bg-superficie-hundida">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={{ top: 16, left: 16, right: 16, bottom: 96 }} className="z-[1000]">
          <Popover.Popup className="popup-suave w-[300px] overflow-hidden rounded-[20px] border border-borde bg-superficie p-1.5 shadow-[0_24px_56px_-16px_rgba(58,26,13,0.38)] outline-none">
            {seguro ? (
              <div className="p-2.5">
                <p className="text-[14.5px] font-bold text-texto">¿Le sacás el acceso a {nombre}?</p>
                <p className="mt-1 text-[13px] text-texto-suave">Deja de entrar y el bot no le contesta. Lo que cargó queda, con su nombre.</p>
                <div className="mt-3 flex gap-2">
                  <Popover.Close onClick={onSacar} disabled={ocupado} className="h-10 flex-1 rounded-full bg-tinta px-3 text-[14px] font-bold text-white disabled:opacity-60">
                    Sí, sacárselo
                  </Popover.Close>
                  <button type="button" onClick={() => setSeguro(false)} className="h-10 rounded-full px-4 text-[14px] font-bold text-texto shadow-[inset_0_0_0_1px_var(--borde)]">
                    No
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setSeguro(true)} className="flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-[14.5px] font-semibold text-estado-problema-texto hover:bg-superficie-hundida/60">
                <Icono nombre="Salir" tamano={16} />
                Sacarle el acceso
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

const COLUMNAS = 'sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,140px)_36px] sm:items-center sm:gap-x-4'

/**
 * La lista de quién ve qué (Lau, 25/11: «demasiado pobre»). En la compu es una tabla:
 * cada persona con cómo entra y desde cuándo, y una columna por sección con su
 * nivel, alineadas para comparar de un vistazo. En el celular, cada uno con sus
 * íconos. Tocar a alguien abre su ficha.
 */
export function ListaAccesos({ personas }: { personas: Persona[] }) {
  // El dueño primero, después vos, después el resto por nombre.
  const orden = [...personas].sort((a, b) => Number(b.rol === 'dueno') - Number(a.rol === 'dueno') || Number(b.soyYo) - Number(a.soyYo) || a.nombre.localeCompare(b.nombre, 'es'))
  return (
    <section aria-label="Quién ve qué" className="overflow-hidden rounded-[18px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)] sm:rounded-[24px]">
      {/* Los nombres de las columnas, con el ícono de cada sección. */}
      <div aria-hidden className={cn('hidden border-b border-borde bg-superficie-hundida/50 px-5 py-3 text-[13px] font-bold text-texto-suave', COLUMNAS)}>
        <span>Persona</span>
        {SECCIONES_CON_PERMISO.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <Icono nombre={s.icono} tamano={16} />
            {s.texto}
          </span>
        ))}
        <span />
      </div>
      <ul className="divide-y divide-borde/70">
        {orden.map((x) => {
          const tocable = !x.soyYo && x.rol !== 'dueno'
          return (
            <li key={x.userId}>
              {/* En la compu se edita en la misma tabla (Lau, 25/11); en el celular, la ficha. */}
              <div className="hidden sm:block">{tocable ? <FilaEditable p={x} /> : <FilaFija p={x} />}</div>
              <div className="sm:hidden">
                {tocable ? (
                  <FilaCelu p={x} />
                ) : (
                  <FilaCeluFija p={x} />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
